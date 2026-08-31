import { and, asc, count, desc, eq, gt, inArray, lte, max, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { appDataDir, db, schema } from './db';
import { loadWorkflow } from './workflow';
import { resolveServiceConfig } from './config';
import { runCodexSession, type CodexSteeringBatch, type CodexUserInput } from './codex';
import { runExternalAgentSession } from './external-agent';
import { CODEX_MODEL, type AgentHarness, type ReasoningEffort } from './agent-harness';
import { prepareTaskWorktree } from './git-workspaces';
import { runtimeLogger } from './logger';
import { logTaskActivity } from './kanban';
import { buildAgentsPromptPrefix, loadAgentsContext } from './agents-context';
import { checkAgentsCompletionGate } from './completion-gate';
import { activeTaskDescription } from './task-description';
import type { CodexRuntimeEvent, Issue } from './types';
import { notifyVoiceJobProgress, notifyVoiceJobStatus } from './voice-agent';
import { agentWaitInstructions } from './agent-wait';
import {
  configuredAgentRetries,
  isRetryableAgentFailure,
  runWithAgentRetries,
} from './agent-retry';
import {
  cleanupTaskHarnessSession,
  closeTaskBrowserSession,
  listTaskHarnessUnits,
  stopTaskHarnessUnit,
  taskHarnessBrowserSession,
  taskHarnessUnitName,
} from './task-harness-sandbox';

let dispatcher: LocalTaskDispatcher | null = null;

export {
  configuredAgentRetries,
  isRetryableAgentFailure,
  runWithAgentRetries,
} from './agent-retry';

export function startLocalTaskDispatcher() {
  if (!dispatcher) {
    dispatcher = new LocalTaskDispatcher();
    dispatcher.start();
  }
  return dispatcher;
}

export function abortLocalTask(taskId: string) {
  return dispatcher?.abortTask(taskId) ?? false;
}

class LocalTaskDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private runningTasks = new Map<string, AbortController>();
  private runningPromises = new Set<Promise<void>>();
  private started = false;
  private stopping = false;
  private stalledTasks = new Set<string>();

  start() {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    this.requeueInterruptedTasks();
    reconcileFailedTaskColumns();
    void this.startPollingAfterCleanup();
  }

  async stop() {
    this.started = false;
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const controller of this.runningTasks.values()) controller.abort();
    await Promise.allSettled([...this.runningPromises]);
  }

  abortTask(taskId: string) {
    const controller = this.runningTasks.get(taskId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async startPollingAfterCleanup() {
    try {
      await this.cleanupInterruptedResources();
    } catch (error) {
      runtimeLogger.error('task harness startup cleanup failed; dispatcher remains paused', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.started) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.startPollingAfterCleanup();
        }, 5_000);
      }
      return;
    }
    if (!this.started) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, Number.parseInt(process.env.KANBAN_AGENT_POLL_MS ?? '5000', 10));
    void this.tick();
  }

  private async tick() {
    this.wakeDueExternalWaits();
    this.checkStalledTasks();
    const queuedRows = db.select({ task: schema.tasks, column: schema.columns })
      .from(schema.tasks)
      .innerJoin(schema.columns, eq(schema.tasks.columnId, schema.columns.id))
      .where(and(
        eq(schema.tasks.agentEnabled, true),
        eq(schema.tasks.agentStatus, 'queued'),
        or(eq(schema.columns.key, 'todo'), eq(schema.columns.key, 'in_progress')),
      ))
      .orderBy(asc(schema.tasks.projectId), asc(schema.tasks.position), asc(schema.tasks.updatedAt))
      .all();

    const globalLimit = maxGlobalTasks();
    const globalRunning = db.select({ value: count() }).from(schema.tasks)
      .where(eq(schema.tasks.agentStatus, 'running'))
      .get()?.value ?? 0;
    let globalSlots = Math.max(0, globalLimit - globalRunning);
    if (globalRunning >= globalLimit) {
      runtimeLogger.debug('global agent concurrency cap reached; deferring queued tasks', {
        global_limit: globalLimit,
        global_running: globalRunning,
        queued: queuedRows.length,
      });
    }

    for (const row of queuedRows) {
      if (globalSlots <= 0) break;
      if (!taskSlotAvailability(row.task.projectId, row.task.agentHarness).available) continue;
      globalSlots -= 1;
      const running = this.runTask(row.task, row.column);
      this.runningPromises.add(running);
      void running.then(
        () => this.runningPromises.delete(running),
        (error) => {
          this.runningPromises.delete(running);
          runtimeLogger.error('unhandled local agent task failure', {
            task_id: row.task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }
  }

  private requeueInterruptedTasks() {
    const runningRows = db.select({ task: schema.tasks })
      .from(schema.tasks)
      .where(eq(schema.tasks.agentStatus, 'running'))
      .all();
    const now = new Date().toISOString();

    for (const row of runningRows) {
      const todoColumn = db.select().from(schema.columns)
        .where(and(eq(schema.columns.projectId, row.task.projectId), eq(schema.columns.key, 'todo')))
        .get();
      db.update(schema.tasks).set({
        agentStatus: row.task.agentEnabled ? 'queued' : 'idle',
        columnId: row.task.agentEnabled ? todoColumn?.id ?? row.task.columnId : row.task.columnId,
        updatedAt: now,
      }).where(eq(schema.tasks.id, row.task.id)).run();
      if (row.task.agentEnabled) {
        const activeRun = activeTaskAgentRun(row.task.id);
        if (activeRun) {
          db.update(schema.taskAgentRuns).set({
            status: 'waiting_external',
            waitKind: 'other',
            waitReason: 'Agent Kanban service restarted during the active turn.',
            resumeAt: now,
            updatedAt: now,
          }).where(eq(schema.taskAgentRuns.id, activeRun.id)).run();
        }
        logTaskActivity(row.task.projectId, row.task.id, null, 'codex_requeued', {
          reason: 'dispatcher_startup_recovery',
        });
        runtimeLogger.warn('requeued interrupted local codex task', { task_id: row.task.id, task_key: row.task.key });
        notifyVoiceJobStatus(row.task.id, 'queued', 'Background agent recovered after a service restart.');
      }
    }
  }

  private wakeDueExternalWaits() {
    const now = new Date().toISOString();
    const dueRuns = db.select().from(schema.taskAgentRuns)
      .where(and(
        eq(schema.taskAgentRuns.status, 'waiting_external'),
        lte(schema.taskAgentRuns.resumeAt, now),
      ))
      .all();
    for (const run of dueRuns) {
      const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, run.taskId)).get();
      if (!task || !task.agentEnabled || task.agentStatus !== 'waiting_external') continue;
      db.update(schema.tasks).set({ agentStatus: 'queued', updatedAt: now })
        .where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.agentStatus, 'waiting_external')))
        .run();
      logTaskActivity(task.projectId, task.id, null, 'agent_wait_resumed', {
        runId: run.id,
        waitKind: run.waitKind,
        waitCount: run.waitCount,
      });
    }
  }

  private checkStalledTasks() {
    const timeoutMs = taskStallTimeoutMs();
    if (timeoutMs <= 0) return;
    const nowMs = Date.now();
    for (const [taskId, controller] of this.runningTasks) {
      if (controller.signal.aborted) continue;
      const lastSeenMs = lastTaskActivityTimestamp(taskId);
      if (lastSeenMs === null || nowMs - lastSeenMs < timeoutMs) continue;
      const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (!task) {
        this.stalledTasks.delete(taskId);
        continue;
      }
      this.stalledTasks.add(taskId);
      logTaskActivity(task.projectId, task.id, null, 'agent_stalled', {
        idle_ms: nowMs - lastSeenMs,
        timeout_ms: timeoutMs,
      });
      runtimeLogger.warn('local agent task stalled; aborting run', {
        task_id: task.id,
        task_key: task.key,
        idle_ms: nowMs - lastSeenMs,
        timeout_ms: timeoutMs,
      });
      controller.abort();
    }
  }

  private async cleanupInterruptedResources() {
    const interruptedRuns = db.select().from(schema.taskAgentRuns)
      .where(eq(schema.taskAgentRuns.status, 'waiting_external'))
      .all();
    const units = await listTaskHarnessUnits();
    await Promise.allSettled(units.map((unit) => stopTaskHarnessUnit(unit)));
    if (units.length) runtimeLogger.warn('cleaned interrupted task harness units', { count: units.length });
    await Promise.allSettled(interruptedRuns.map((run) => closeTaskBrowserSession(run.browserSessionName)));
    if (interruptedRuns.length) {
      db.update(schema.taskAgentRuns).set({
        currentUnitName: null,
        browserSessionName: null,
        updatedAt: new Date().toISOString(),
      }).where(inArray(schema.taskAgentRuns.id, interruptedRuns.map((run) => run.id))).run();
    }
    if (units.length) {
      db.update(schema.taskAgentRuns).set({
        currentUnitName: null,
        browserSessionName: null,
        updatedAt: new Date().toISOString(),
      }).where(inArray(schema.taskAgentRuns.currentUnitName, units)).run();
    }

    const terminalRuns = db.select({
      id: schema.taskAgentRuns.id,
      taskId: schema.taskAgentRuns.taskId,
      projectId: schema.tasks.projectId,
    }).from(schema.taskAgentRuns)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskAgentRuns.taskId))
      .where(inArray(schema.taskAgentRuns.status, ['completed', 'failed', 'cancelled']))
      .all();
    await Promise.allSettled(terminalRuns.map((run) => cleanupTaskHarnessSession(
      appDataDir('task-sessions', run.projectId, run.taskId, run.id),
    )));
  }

  private async runTask(queued: typeof schema.tasks.$inferSelect, queuedColumn: typeof schema.columns.$inferSelect) {
    if (this.runningTasks.has(queued.id)) return;
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, queued.projectId)).get();
    if (!project) {
      db.update(schema.tasks).set({ agentStatus: 'failed', updatedAt: new Date().toISOString() })
        .where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'queued')))
        .run();
      return;
    }

    const controller = new AbortController();
    this.runningTasks.set(queued.id, controller);
    const inProgressColumn = db.select().from(schema.columns)
      .where(and(eq(schema.columns.projectId, queued.projectId), eq(schema.columns.key, 'in_progress')))
      .get();
    const reviewColumn = db.select().from(schema.columns)
      .where(and(eq(schema.columns.projectId, queued.projectId), eq(schema.columns.key, 'in_review')))
      .get();
    const started = db.update(schema.tasks).set({
      agentStatus: 'running',
      columnId: inProgressColumn?.id ?? queued.columnId,
      updatedAt: new Date().toISOString(),
    })
      .where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'queued')))
      .run();
    if (started.changes === 0) {
      this.runningTasks.delete(queued.id);
      runtimeLogger.warn('task left the queue before dispatch; skipping run', {
        task_id: queued.id,
        task_key: queued.key,
      });
      return;
    }
    const agentRun = ensureTaskAgentRun(queued);
    const sessionRoot = appDataDir('task-sessions', project.id, queued.id, agentRun.id);
    const browserSession = taskHarnessBrowserSession(sessionRoot);
    db.update(schema.taskAgentRuns).set({
      status: 'running',
      waitKind: null,
      waitReason: null,
      resumeAt: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.taskAgentRuns.id, agentRun.id)).run();
    logTaskActivity(queued.projectId, queued.id, null, 'codex_started', {
      column: queuedColumn.key,
      harness: queued.agentHarness,
      reasoningEffort: queued.reasoningEffort,
    });
    notifyVoiceJobStatus(queued.id, 'running');

    try {
      const workflow = await loadWorkflow();
      const config = resolveServiceConfig(workflow);
      const issue = taskToIssue(queued, inProgressColumn?.nameEn ?? queuedColumn.nameEn);
      const taskWorktree = await prepareTaskWorktree({
        projectPath: project.folderPath,
        worktreePath: appDataDir('worktrees', project.id, queued.id, 'tree'),
        taskId: queued.id,
        taskKey: queued.key,
      });
      issue.branch_name = taskWorktree.branchName;
      const agentsContext = await loadAgentsContext(taskWorktree.projectPath, taskWorktree.worktreeRoot);
      const workspacePath = agentsContext.path ? path.dirname(agentsContext.path) : taskWorktree.projectPath;
      const agentsPromptPrefix = buildAgentsPromptPrefix(agentsContext);
      const taskPromptPrefix = [
        agentsPromptPrefix,
        agentRuntimeSafetyInstructions(),
        agentCompletionHandoffInstructions(),
        agentWaitInstructions(),
      ]
        .filter(Boolean)
        .join('\n\n---\n\n');
      const runStartedAt = new Date().toISOString();
      logTaskActivity(queued.projectId, queued.id, null, 'codex_worktree_ready', {
        workspacePath,
        worktreeRoot: taskWorktree.worktreeRoot,
        branch: taskWorktree.branchName,
        revision: taskWorktree.revision,
        createdNow: taskWorktree.createdNow,
        recoveryRef: taskWorktree.recoveryRef,
      });
      logTaskActivity(queued.projectId, queued.id, null, agentsContext.path ? 'agents_context_loaded' : 'agents_context_missing', {
        path: agentsContext.path,
        workspacePath,
        truncated: agentsContext.truncated,
      });
      let seenSteeringAt = runStartedAt;
      let seenAttachmentAt = runStartedAt;
      let agentMessageBuffer = '';
      let latestCompletionSummary = '';
      let lastAgentUpdateLogMs = 0;
      let agentBrowserEvidenceLogged = false;
      const flushAgentUpdate = (force = false) => {
        const body = normalizeAgentMessage(agentMessageBuffer);
        if (!body) return;
        const nowMs = Date.now();
        if (!force && nowMs - lastAgentUpdateLogMs < 3000) return;
        lastAgentUpdateLogMs = nowMs;
        logTaskActivity(queued.projectId, queued.id, null, 'codex_text_update', { body });
        notifyVoiceJobProgress(queued.id, body);
      };
      runtimeLogger.info('local agent task started', {
        task_id: queued.id,
        task_key: queued.key,
        project: project.key,
        harness: queued.agentHarness,
        reasoning_effort: queued.reasoningEffort,
      });
      const harnessOptions = {
        harness: queued.agentHarness,
        reasoningEffort: queued.reasoningEffort,
        config: config.codex,
        workspacePath,
        issue,
        promptTemplate: workflow.prompt_template || defaultTaskPrompt(),
        promptPrefix: taskPromptPrefix,
        maxTurns: Math.min(config.agent.maxTurns, Number.parseInt(process.env.KANBAN_AGENT_MAX_TURNS ?? String(config.agent.maxTurns), 10)),
        signal: controller.signal,
        onEvent: (event: CodexRuntimeEvent) => {
          runtimeLogger.info('local agent event', {
            task_id: queued.id,
            task_key: queued.key,
            harness: queued.agentHarness,
            event: event.event,
            session_id: event.session_id,
            message: event.message,
          });
          if (event.event.startsWith('prime/compaction_') && event.message) {
            logTaskActivity(queued.projectId, queued.id, null, 'codex_text_update', { body: event.message });
            notifyVoiceJobProgress(queued.id, event.message);
            return;
          }
          const browserEvidence = agentBrowserEvidenceMessage(event);
          if (browserEvidence && !agentBrowserEvidenceLogged) {
            agentBrowserEvidenceLogged = true;
            logTaskActivity(queued.projectId, queued.id, null, 'codex_browser_evidence', {
              event: event.event,
              message: browserEvidence,
            });
          }
          if (event.event === 'item/agentMessage/delta') {
            const fragment = naturalAgentFragment(event.message);
            if (fragment) {
              agentMessageBuffer += fragment;
              flushAgentUpdate(false);
            }
            return;
          }
          if (event.event === 'item/completed') {
            const completedBody = normalizeAgentMessage(agentMessageBuffer)
              ?? completionSummaryFromAgentEvent(event);
            if (completedBody) latestCompletionSummary = completedBody;
            flushAgentUpdate(true);
            agentMessageBuffer = '';
          }
        },
        refreshIssue: async () => {
          const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, queued.id)).get();
          if (!task) return null;
          const currentColumn = db.select().from(schema.columns).where(eq(schema.columns.id, task.columnId)).get();
          return taskToIssue(task, currentColumn?.nameEn ?? 'In Progress');
        },
        loadSteering: async () => {
          const batch = buildLiveSteeringBatch(queued, seenSteeringAt, seenAttachmentAt);
          if (!batch) return null;
          return {
            input: batch.input,
            description: batch.description,
            markDelivered: () => {
              if (batch.newestSteeringAt) seenSteeringAt = maxIso(seenSteeringAt, batch.newestSteeringAt);
              if (batch.newestAttachmentAt) seenAttachmentAt = maxIso(seenAttachmentAt, batch.newestAttachmentAt);
            },
          };
        },
        shouldContinue: () => {
          const newestMessage = db.select({ value: max(schema.comments.createdAt) }).from(schema.comments)
            .where(and(eq(schema.comments.taskId, queued.id), eq(schema.comments.kind, 'steering')))
            .get()?.value;
          if (newestMessage && newestMessage > seenSteeringAt) {
            seenSteeringAt = newestMessage;
            return true;
          }
          const newestAttachment = db.select({ value: max(schema.attachments.createdAt) }).from(schema.attachments)
            .where(eq(schema.attachments.taskId, queued.id))
            .get()?.value;
          if (newestAttachment && newestAttachment > seenAttachmentAt) {
            seenAttachmentAt = newestAttachment;
            return true;
          }
          const newestAnnotation = db.select({ value: max(schema.attachmentAnnotations.updatedAt) })
            .from(schema.attachmentAnnotations)
            .innerJoin(schema.attachments, eq(schema.attachmentAnnotations.attachmentId, schema.attachments.id))
            .where(eq(schema.attachments.taskId, queued.id))
            .get()?.value;
          if (newestAnnotation && newestAnnotation > seenAttachmentAt) {
            seenAttachmentAt = newestAnnotation;
            return true;
          }
          return false;
        },
        completionCheck: async () => checkAgentsCompletionGate({
          workspacePath,
          agentsContent: agentsContext.content,
          hasAgentBrowserEvidence: hasAgentBrowserEvidence(queued.id, runStartedAt),
          taskIdentifier: queued.key,
          taskTitle: queued.title,
        }),
      };
      let nativeSessionId = agentRun.nativeSessionId;
      const result = await runWithAgentRetries({
        retries: configuredAgentRetries(),
        signal: controller.signal,
        shouldRetry: isRetryableAgentFailure,
        run: (attempt) => {
          const unitName = taskHarnessUnitName(queued.id, agentRun.id, attempt);
          return runTaskAgentHarness({
            ...harnessOptions,
            attempt: attempt === 0 ? null : attempt,
            nativeSessionId,
            onSession: (sessionId) => {
              nativeSessionId = sessionId;
              db.update(schema.taskAgentRuns).set({ nativeSessionId: sessionId, updatedAt: new Date().toISOString() })
                .where(eq(schema.taskAgentRuns.id, agentRun.id)).run();
            },
            runtime: {
              unitName,
              sessionRoot,
              onUnit: (activeUnit, browserSession) => {
                db.update(schema.taskAgentRuns).set({
                  currentUnitName: activeUnit,
                  browserSessionName: browserSession,
                  updatedAt: new Date().toISOString(),
                }).where(eq(schema.taskAgentRuns.id, agentRun.id)).run();
              },
            },
          });
        },
        onRetry: (retryNumber, error) => {
          agentMessageBuffer = '';
          const message = error instanceof Error ? error.message : String(error);
          logTaskActivity(queued.projectId, queued.id, null, 'codex_retrying', {
            attempt: retryNumber,
            maxRetries: configuredAgentRetries(),
            error: message,
          });
          notifyVoiceJobProgress(queued.id, `Agent run failed. Retrying automatically (${retryNumber}/${configuredAgentRetries()}).`);
          runtimeLogger.warn('retrying failed local agent task', {
            task_id: queued.id,
            task_key: queued.key,
            harness: queued.agentHarness,
            retry: retryNumber,
            error: message,
          });
        },
      });

      if (controller.signal.aborted) throw new Error('turn_cancelled');
      await closeTaskBrowserSession(browserSession);
      if (result.waitRequest) {
        const now = new Date();
        const resumeAt = new Date(now.getTime() + result.waitRequest.resumeAfterSeconds * 1000).toISOString();
        const parked = db.update(schema.tasks).set({
          agentStatus: 'waiting_external',
          updatedAt: now.toISOString(),
        }).where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'running'))).run();
        if (parked.changes === 0) {
          finishTaskAgentRun(agentRun.id, 'cancelled');
          await cleanupTaskSession(sessionRoot, queued.id, agentRun.id);
          runtimeLogger.warn('task changed before external wait; wait request dropped', {
            task_id: queued.id,
            task_key: queued.key,
            run_id: agentRun.id,
          });
          return;
        }
        db.update(schema.taskAgentRuns).set({
          status: 'waiting_external',
          nativeSessionId: result.nativeSessionId,
          waitKind: result.waitRequest.kind,
          waitReason: result.waitRequest.reason,
          resumeAt,
          waitCount: agentRun.waitCount + 1,
          currentUnitName: null,
          browserSessionName: null,
          updatedAt: now.toISOString(),
        }).where(eq(schema.taskAgentRuns.id, agentRun.id)).run();
        logTaskActivity(queued.projectId, queued.id, null, 'agent_waiting_external', {
          runId: agentRun.id,
          kind: result.waitRequest.kind,
          reason: result.waitRequest.reason,
          resumeAt,
        });
        notifyVoiceJobProgress(queued.id, `Waiting externally: ${result.waitRequest.reason}`);
        runtimeLogger.info('local agent task parked for external wait', {
          task_id: queued.id,
          task_key: queued.key,
          run_id: agentRun.id,
          kind: result.waitRequest.kind,
          resume_at: resumeAt,
        });
        return;
      }
      const completed = db.update(schema.tasks).set({
        agentStatus: 'done',
        columnId: reviewColumn?.id ?? queued.columnId,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'running'))).run();
      finishTaskAgentRun(agentRun.id, completed.changes === 0 ? 'cancelled' : 'completed');
      await cleanupTaskSession(sessionRoot, queued.id, agentRun.id);
      logTaskActivity(queued.projectId, queued.id, null, 'codex_completed', {
        nextColumn: reviewColumn?.key ?? null,
        harness: queued.agentHarness,
        summary: latestCompletionSummary || null,
        applied: completed.changes === 1,
      });
      if (completed.changes === 1) {
        notifyVoiceJobStatus(queued.id, 'done');
      } else {
        runtimeLogger.warn('task changed before completion; result not applied', {
          task_id: queued.id,
          task_key: queued.key,
          run_id: agentRun.id,
        });
      }
      runtimeLogger.info('local agent task completed', {
        task_id: queued.id,
        task_key: queued.key,
        harness: queued.agentHarness,
      });
    } catch (error) {
      const stalled = this.stalledTasks.delete(queued.id);
      if (controller.signal.aborted) {
        await closeTaskBrowserSession(browserSession);
        const currentTask = db.select().from(schema.tasks).where(eq(schema.tasks.id, queued.id)).get();
        if (this.stopping && currentTask?.agentStatus === 'running') {
          runtimeLogger.info('local agent task interrupted for service shutdown', {
            task_id: queued.id,
            task_key: queued.key,
            run_id: agentRun.id,
          });
          return;
        }
        if (stalled) {
          const stalledFailure = db.update(schema.tasks).set({
            agentStatus: 'failed',
            columnId: reviewColumn?.id ?? queued.columnId,
            updatedAt: new Date().toISOString(),
          }).where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'running'))).run();
          finishTaskAgentRun(agentRun.id, 'failed');
          await cleanupTaskSession(sessionRoot, queued.id, agentRun.id);
          logTaskActivity(queued.projectId, queued.id, null, 'codex_stalled_failed', {
            error: 'agent stalled without activity',
            applied: stalledFailure.changes === 1,
          });
          if (stalledFailure.changes === 1) {
            notifyVoiceJobStatus(queued.id, 'failed');
          }
          runtimeLogger.warn('local agent task failed after stall', {
            task_id: queued.id,
            task_key: queued.key,
            run_id: agentRun.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        finishTaskAgentRun(agentRun.id, 'cancelled');
        await cleanupTaskSession(sessionRoot, queued.id, agentRun.id);
        logTaskActivity(queued.projectId, queued.id, null, 'codex_cancelled', {});
        notifyVoiceJobStatus(queued.id, 'cancelled');
        runtimeLogger.info('local codex task cancelled', { task_id: queued.id, task_key: queued.key });
        return;
      }
      const failed = db.update(schema.tasks).set({
        agentStatus: 'failed',
        columnId: reviewColumn?.id ?? queued.columnId,
        updatedAt: new Date().toISOString(),
      })
        .where(and(eq(schema.tasks.id, queued.id), eq(schema.tasks.agentStatus, 'running')))
        .run();
      finishTaskAgentRun(agentRun.id, 'failed');
      await closeTaskBrowserSession(browserSession);
      await cleanupTaskSession(sessionRoot, queued.id, agentRun.id);
      logTaskActivity(queued.projectId, queued.id, null, 'codex_failed', {
        error: error instanceof Error ? error.message : String(error),
        nextColumn: reviewColumn?.key ?? null,
        applied: failed.changes === 1,
      });
      if (failed.changes === 1) {
        notifyVoiceJobStatus(queued.id, 'failed');
      } else {
        runtimeLogger.warn('task changed before failure was recorded; status left untouched', {
          task_id: queued.id,
          task_key: queued.key,
          run_id: agentRun.id,
        });
      }
      runtimeLogger.warn('local codex task failed', {
        task_id: queued.id,
        task_key: queued.key,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.runningTasks.delete(queued.id);
    }
  }
}

function activeTaskAgentRun(taskId: string) {
  return db.select().from(schema.taskAgentRuns)
    .where(and(
      eq(schema.taskAgentRuns.taskId, taskId),
      inArray(schema.taskAgentRuns.status, ['running', 'waiting_external']),
    ))
    .orderBy(desc(schema.taskAgentRuns.createdAt))
    .get();
}

function ensureTaskAgentRun(task: typeof schema.tasks.$inferSelect) {
  const existing = activeTaskAgentRun(task.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const run = {
    id: randomUUID(),
    taskId: task.id,
    harness: task.agentHarness,
    status: 'running' as const,
    nativeSessionId: null,
    currentUnitName: null,
    browserSessionName: null,
    waitKind: null,
    waitReason: null,
    resumeAt: null,
    waitCount: 0,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
  db.insert(schema.taskAgentRuns).values(run).run();
  return run;
}

function finishTaskAgentRun(runId: string, status: 'completed' | 'failed' | 'cancelled') {
  const now = new Date().toISOString();
  db.update(schema.taskAgentRuns).set({
    status,
    currentUnitName: null,
    browserSessionName: null,
    waitKind: null,
    waitReason: null,
    resumeAt: null,
    updatedAt: now,
    completedAt: now,
  }).where(eq(schema.taskAgentRuns.id, runId)).run();
}

async function cleanupTaskSession(sessionRoot: string, taskId: string, runId: string) {
  try {
    await cleanupTaskHarnessSession(sessionRoot);
  } catch (error) {
    runtimeLogger.warn('task harness session cleanup failed', {
      task_id: taskId,
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function maxGlobalTasks() {
  const requested = Number.parseInt(process.env.KANBAN_MAX_GLOBAL_TASKS ?? '4', 10);
  return Number.isFinite(requested) ? Math.min(32, Math.max(1, requested)) : 4;
}

export function taskStallTimeoutMs() {
  const requested = Number.parseInt(process.env.KANBAN_TASK_STALL_TIMEOUT_MS ?? String(45 * 60 * 1000), 10);
  return Number.isFinite(requested) ? Math.max(0, requested) : 45 * 60 * 1000;
}

/**
 * Newest timestamp (in ms) seen for a task across its row, its active agent
 * run, and its activity log. Returns null when no timestamp is available so
 * the caller can fail open instead of aborting a healthy run.
 */
function lastTaskActivityTimestamp(taskId: string): number | null {
  const task = db.select({ updatedAt: schema.tasks.updatedAt })
    .from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  const run = db.select({ updatedAt: schema.taskAgentRuns.updatedAt })
    .from(schema.taskAgentRuns)
    .where(and(
      eq(schema.taskAgentRuns.taskId, taskId),
      inArray(schema.taskAgentRuns.status, ['running', 'waiting_external']),
    ))
    .get();
  const newestActivity = db.select({ value: max(schema.activity.createdAt) })
    .from(schema.activity).where(eq(schema.activity.taskId, taskId)).get()?.value;
  const candidates = [task?.updatedAt, run?.updatedAt, newestActivity]
    .filter((value): value is string => typeof value === 'string');
  if (!candidates.length) return null;
  const newest = Math.max(...candidates.map((value) => Date.parse(value)));
  return Number.isFinite(newest) ? newest : null;
}

export function agentRuntimeSafetyInstructions() {
  return [
    'Runtime safety:',
    '- This is a persistent task-owned worktree. Inspect and preserve existing task changes before editing; never use reset, clean, checkout, or another destructive command to discard them.',
    '- Commit each coherent, validated implementation milestone before starting the next one so progress remains recoverable across process failures or compaction.',
    '- Run memory-intensive validation commands sequentially, especially builds, typechecks, test suites, and browser sessions.',
    '- Never run commands in parallel when they write the same generated workspace state (for example `.nuxt`).',
    '- Reuse an existing development server when possible and stop it as soon as the required verification is complete.',
  ].join('\n');
}

export function agentCompletionHandoffInstructions() {
  return [
    'Completion handoff:',
    '- End your final response with a short, user-facing summary in the same language as the task.',
    '- Explain the outcome at a big-picture product level, not as a list of implementation details or changed code symbols.',
    '- Include a separate short section with concrete places or flows the user can test.',
    '- Mention any remaining limitation plainly. Do not claim completion before the requested validation succeeds.',
  ].join('\n');
}

export function taskSlotAvailability(projectId: string, harness: AgentHarness) {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    return {
      available: false,
      projectLimit: 0,
      harnessLimit: 0,
      projectRunning: 0,
      harnessRunning: 0,
    };
  }
  const harnessLimit = db.select().from(schema.projectHarnessLimits)
    .where(and(
      eq(schema.projectHarnessLimits.projectId, projectId),
      eq(schema.projectHarnessLimits.harness, harness),
    )).get()?.maxConcurrentTasks ?? project.agentConcurrencyLimit;
  const projectRunning = db.select({ value: count() }).from(schema.tasks)
    .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.agentStatus, 'running')))
    .get()?.value ?? 0;
  const harnessRunning = db.select({ value: count() }).from(schema.tasks)
    .where(and(
      eq(schema.tasks.projectId, projectId),
      eq(schema.tasks.agentHarness, harness),
      eq(schema.tasks.agentStatus, 'running'),
    )).get()?.value ?? 0;
  return {
    available: projectRunning < project.agentConcurrencyLimit
      && harnessRunning < harnessLimit,
    projectLimit: project.agentConcurrencyLimit,
    harnessLimit,
    projectRunning,
    harnessRunning,
  };
}

export function reconcileFailedTaskColumns() {
  const failedRows = db.select({ task: schema.tasks, column: schema.columns })
    .from(schema.tasks)
    .innerJoin(schema.columns, eq(schema.tasks.columnId, schema.columns.id))
    .where(and(
      eq(schema.tasks.agentStatus, 'failed'),
      eq(schema.columns.key, 'in_progress'),
    ))
    .all();
  const now = new Date().toISOString();

  for (const row of failedRows) {
    const reviewColumn = db.select().from(schema.columns)
      .where(and(eq(schema.columns.projectId, row.task.projectId), eq(schema.columns.key, 'in_review')))
      .get();
    if (!reviewColumn) continue;
    db.update(schema.tasks).set({ columnId: reviewColumn.id, updatedAt: now })
      .where(and(eq(schema.tasks.id, row.task.id), eq(schema.tasks.agentStatus, 'failed')))
      .run();
    logTaskActivity(row.task.projectId, row.task.id, null, 'codex_failure_recovered', {
      reason: 'failed_task_left_in_progress',
      nextColumn: reviewColumn.key,
    });
    runtimeLogger.warn('moved failed local codex task to review', {
      task_id: row.task.id,
      task_key: row.task.key,
    });
  }

  return failedRows.length;
}

function taskToIssue(task: typeof schema.tasks.$inferSelect, state: string): Issue {
  const attachments = db.select().from(schema.attachments)
    .where(eq(schema.attachments.taskId, task.id))
    .orderBy(asc(schema.attachments.createdAt))
    .all();
  const attachmentIds = attachments.map((attachment) => attachment.id);
  const annotations = attachmentIds.length
    ? db.select().from(schema.attachmentAnnotations)
      .where(inArray(schema.attachmentAnnotations.attachmentId, attachmentIds))
      .all()
    : [];
  const tags = db.select().from(schema.taskTags)
    .where(eq(schema.taskTags.taskId, task.id))
    .orderBy(asc(schema.taskTags.name))
    .all()
    .map((tag) => tag.name);
  const oberthema = db.select().from(schema.oberthemen)
    .where(eq(schema.oberthemen.id, task.oberthemaId))
    .get();
  const unterthema = task.unterthemaId
    ? db.select().from(schema.unterthemen).where(eq(schema.unterthemen.id, task.unterthemaId)).get()
    : null;
  const steering = db.select({
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    userName: schema.users.name,
  })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(and(eq(schema.comments.taskId, task.id), eq(schema.comments.kind, 'steering')))
    .orderBy(asc(schema.comments.createdAt))
    .all();
  const agentUpdates = latestAgentUpdates(task.id);
  const detailBlocks = [
    activeTaskDescription(task),
    oberthema ? `Hierarchy: ${oberthema.name}${unterthema ? ` > ${unterthema.name}` : ''}` : null,
    tags.length ? `Tags: ${tags.map((tag) => `#${tag}`).join(', ')}` : null,
    attachments.length
      ? ['Attachments available to inspect:', ...attachments.map((file) => {
          const annotation = annotations.find((item) => item.attachmentId === file.id);
          return annotation
            ? `- ${file.fileName}: ${annotation.renderedStoragePath} (annotated image; original at ${file.storagePath})`
            : `- ${file.fileName}: ${file.storagePath}`;
        })].join('\n')
      : null,
    steering.length
      ? ['Steering messages from the project team:', ...steering.map((message) => `- ${message.createdAt} ${message.userName}: ${message.body}`)].join('\n')
      : null,
    agentUpdates.length
      ? ['Previous agent status summaries:', ...agentUpdates.map((update) => `- ${update.createdAt}: ${update.body}`)].join('\n')
      : null,
  ].filter(Boolean);

  return {
    id: task.id,
    identifier: task.key,
    title: task.title,
    description: detailBlocks.join('\n\n') || null,
    priority: null,
    state,
    branch_name: null,
    url: null,
    labels: [`agent:${task.agentStatus}`, ...tags],
    blocked_by: [],
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

async function runTaskAgentHarness(options: Parameters<typeof runCodexSession>[0] & {
  harness: AgentHarness;
  reasoningEffort: ReasoningEffort;
}) {
  const { harness, reasoningEffort, config, loadSteering, ...common } = options;
  if (harness === 'codex') {
    return runCodexSession({
      ...common,
      loadSteering,
      config: {
        ...config,
        model: CODEX_MODEL,
        reasoningEffort,
      },
    });
  }

  return runExternalAgentSession({
    harness,
    reasoningEffort,
    turnTimeoutMs: config.turnTimeoutMs,
    workspacePath: common.workspacePath,
    issue: common.issue,
    promptTemplate: common.promptTemplate,
    promptPrefix: common.promptPrefix,
    attempt: common.attempt,
    maxTurns: common.maxTurns,
    signal: common.signal,
    onEvent: common.onEvent,
    refreshIssue: common.refreshIssue,
    shouldContinue: common.shouldContinue,
    completionCheck: common.completionCheck,
    nativeSessionId: common.nativeSessionId,
    onSession: common.onSession,
    runtime: common.runtime ? {
      unitNamePrefix: common.runtime.unitName,
      sessionRoot: common.runtime.sessionRoot,
      onUnit: common.runtime.onUnit,
    } : undefined,
  });
}

function buildLiveSteeringBatch(
  task: typeof schema.tasks.$inferSelect,
  seenSteeringAt: string,
  seenAttachmentAt: string,
): (CodexSteeringBatch & { newestSteeringAt: string | null; newestAttachmentAt: string | null }) | null {
  const steering = db.select({
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    userName: schema.users.name,
  })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(and(eq(schema.comments.taskId, task.id), eq(schema.comments.kind, 'steering')))
    .orderBy(asc(schema.comments.createdAt))
    .all()
    .filter((message) => message.createdAt > seenSteeringAt);

  const attachmentRows = db.select({
    attachment: schema.attachments,
    annotation: schema.attachmentAnnotations,
  })
    .from(schema.attachments)
    .leftJoin(schema.attachmentAnnotations, eq(schema.attachmentAnnotations.attachmentId, schema.attachments.id))
    .where(eq(schema.attachments.taskId, task.id))
    .orderBy(asc(schema.attachments.createdAt))
    .all()
    .filter((row) => row.attachment.createdAt > seenAttachmentAt || (row.annotation?.updatedAt ?? '') > seenAttachmentAt);

  if (!steering.length && !attachmentRows.length) return null;

  const attachmentDescriptions = attachmentRows.map((row) => {
    const pathForAgent = row.annotation?.renderedStoragePath ?? row.attachment.storagePath;
    const annotationNote = row.annotation ? ' annotated image' : '';
    return `- ${row.attachment.createdAt} ${row.attachment.fileName}:${annotationNote} ${pathForAgent}`;
  });
  const lines = [
    `New project steering for ${task.key}: ${task.title}`,
    'Use this context immediately before continuing. If it conflicts with previous work, adapt the current work instead of starting over.',
    steering.length
      ? ['Steering messages:', ...steering.map((message) => `- ${message.createdAt} ${message.userName}: ${message.body}`)].join('\n')
      : null,
    attachmentDescriptions.length
      ? ['New or updated attachments:', ...attachmentDescriptions].join('\n')
      : null,
  ].filter(Boolean);

  const input: CodexUserInput[] = [{ type: 'text', text: lines.join('\n\n'), text_elements: [] }];
  for (const row of attachmentRows) {
    if (!row.attachment.mimeType.startsWith('image/')) continue;
    input.push({
      type: 'localImage',
      path: row.annotation?.renderedStoragePath ?? row.attachment.storagePath,
      detail: 'original',
    });
  }

  return {
    input,
    description: `delivered ${steering.length} steering message(s) and ${attachmentRows.length} attachment update(s)`,
    newestSteeringAt: newestIso(steering.map((message) => message.createdAt)),
    newestAttachmentAt: newestIso(attachmentRows.flatMap((row) => [
      row.attachment.createdAt,
      row.annotation?.updatedAt ?? null,
    ])),
  };
}

function newestIso(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function maxIso(left: string, right: string) {
  return left > right ? left : right;
}

function latestAgentUpdates(taskId: string) {
  return db.select({
    metadata: schema.activity.metadata,
    createdAt: schema.activity.createdAt,
  })
    .from(schema.activity)
    .where(and(eq(schema.activity.taskId, taskId), eq(schema.activity.action, 'codex_text_update')))
    .orderBy(desc(schema.activity.createdAt))
    .limit(5)
    .all()
    .map((row) => ({
      createdAt: row.createdAt,
      body: parseMetadataString(row.metadata, 'body'),
    }))
    .filter((row): row is { createdAt: string; body: string } => Boolean(row.body))
    .reverse();
}

function naturalAgentFragment(message: string | null | undefined) {
  if (!message || message === 'item/agentMessage/delta') return null;
  if (message.startsWith('item/') || message.startsWith('turn/') || message.startsWith('thread/')) return null;
  return message;
}

function normalizeAgentMessage(message: string) {
  const normalized = message
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized ? normalized.slice(-3000) : null;
}

export function completionSummaryFromAgentEvent(event: Pick<CodexRuntimeEvent, 'event' | 'raw'>) {
  if (event.event !== 'item/completed') return null;
  const raw = recordValue(event.raw);
  const item = recordValue(raw.item);
  const type = String(item.type ?? '').toLowerCase();
  if (!type.includes('agent') || !type.includes('message')) return null;
  return normalizeAgentMessage(textValue(item.text ?? item.content));
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textValue).join('');
  const record = recordValue(value);
  return textValue(record.text ?? record.content ?? '');
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseMetadataString(metadata: string | null, key: string) {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    const value = parsed?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function hasAgentBrowserEvidence(taskId: string, after: string) {
  const value = db.select({ value: count() })
    .from(schema.activity)
    .where(and(
      eq(schema.activity.taskId, taskId),
      gt(schema.activity.createdAt, after),
      eq(schema.activity.action, 'codex_browser_evidence'),
    ))
    .get()?.value ?? 0;
  return value > 0;
}

function agentBrowserEvidenceMessage(event: { message?: string | null }) {
  const message = event.message?.trim();
  if (!message || !message.toLowerCase().includes('agent-browser')) return null;
  return message.slice(0, 1000);
}

function defaultTaskPrompt() {
  return [
    'You are working on a local Kanban task.',
    'Mandatory project instructions from AGENTS.md have been injected above. Follow them before and during all work.',
    'Task: {{ issue.identifier }} - {{ issue.title }}',
    '',
    '{{ issue.description }}',
    '',
    'Work in the current project folder. Keep changes focused and validate them before finishing.',
  ].join('\n');
}
