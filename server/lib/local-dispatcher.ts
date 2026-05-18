import { and, asc, count, eq, gt, like, max } from 'drizzle-orm';
import path from 'node:path';
import { db, schema } from './db';
import { loadWorkflow } from './workflow';
import { resolveServiceConfig } from './config';
import { runCodexSession } from './codex';
import { runtimeLogger } from './logger';
import { logTaskActivity } from './kanban';
import { buildAgentsPromptPrefix, loadAgentsContext } from './agents-context';
import { checkAgentsCompletionGate } from './completion-gate';
import type { Issue } from './types';

let dispatcher: LocalTaskDispatcher | null = null;

export function startLocalTaskDispatcher() {
  if (!dispatcher) {
    dispatcher = new LocalTaskDispatcher();
    dispatcher.start();
  }
  return dispatcher;
}

class LocalTaskDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private runningProjects = new Map<string, number>();

  start() {
    if (this.timer) return;
    this.requeueInterruptedTasks();
    this.timer = setInterval(() => {
      void this.tick();
    }, Number.parseInt(process.env.KANBAN_AGENT_POLL_MS ?? '5000', 10));
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    const queuedRows = db.select({ task: schema.tasks, column: schema.columns })
      .from(schema.tasks)
      .innerJoin(schema.columns, eq(schema.tasks.columnId, schema.columns.id))
      .where(and(eq(schema.tasks.agentStatus, 'queued'), eq(schema.columns.key, 'todo')))
      .orderBy(asc(schema.tasks.projectId), asc(schema.tasks.position), asc(schema.tasks.updatedAt))
      .all();

    for (const row of queuedRows) {
      const projectId = row.task.projectId;
      const projectLimit = Number.parseInt(process.env.KANBAN_AGENT_PROJECT_CONCURRENCY ?? '1', 10);
      if ((this.runningProjects.get(projectId) ?? 0) >= projectLimit) continue;
      const activeCount = db.select({ value: count() }).from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.agentStatus, 'running')))
        .get()?.value ?? 0;
      if (activeCount >= projectLimit) continue;
      void this.runTask(row.task, row.column);
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
        agentStatus: 'queued',
        columnId: todoColumn?.id ?? row.task.columnId,
        updatedAt: now,
      }).where(eq(schema.tasks.id, row.task.id)).run();
      logTaskActivity(row.task.projectId, row.task.id, null, 'codex_requeued', {
        reason: 'dispatcher_startup_recovery',
      });
      runtimeLogger.warn('requeued interrupted local codex task', { task_id: row.task.id, task_key: row.task.key });
    }
  }

  private async runTask(queued: typeof schema.tasks.$inferSelect, queuedColumn: typeof schema.columns.$inferSelect) {
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, queued.projectId)).get();
    if (!project) {
      db.update(schema.tasks).set({ agentStatus: 'failed', updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, queued.id))
        .run();
      return;
    }

    this.runningProjects.set(queued.projectId, (this.runningProjects.get(queued.projectId) ?? 0) + 1);
    const inProgressColumn = db.select().from(schema.columns)
      .where(and(eq(schema.columns.projectId, queued.projectId), eq(schema.columns.key, 'in_progress')))
      .get();
    db.update(schema.tasks).set({
      agentStatus: 'running',
      columnId: inProgressColumn?.id ?? queued.columnId,
      updatedAt: new Date().toISOString(),
    })
      .where(eq(schema.tasks.id, queued.id))
      .run();
    logTaskActivity(queued.projectId, queued.id, null, 'codex_started', { column: queuedColumn.key });

    try {
      const workflow = await loadWorkflow();
      const config = resolveServiceConfig(workflow);
      const issue = taskToIssue(queued, inProgressColumn?.nameEn ?? queuedColumn.nameEn);
      const agentsContext = await loadAgentsContext(project.folderPath);
      const workspacePath = agentsContext.path ? path.dirname(agentsContext.path) : project.folderPath;
      const agentsPromptPrefix = buildAgentsPromptPrefix(agentsContext);
      const runStartedAt = new Date().toISOString();
      logTaskActivity(queued.projectId, queued.id, null, agentsContext.path ? 'agents_context_loaded' : 'agents_context_missing', {
        path: agentsContext.path,
        workspacePath,
        truncated: agentsContext.truncated,
      });
      let seenSteeringAt = new Date().toISOString();
      let seenAttachmentAt = seenSteeringAt;
      runtimeLogger.info('local codex task started', { task_id: queued.id, task_key: queued.key, project: project.key });
      await runCodexSession({
        config: config.codex,
        workspacePath,
        issue,
        promptTemplate: workflow.prompt_template || defaultTaskPrompt(),
        promptPrefix: agentsPromptPrefix,
        attempt: null,
        maxTurns: Math.min(config.agent.maxTurns, Number.parseInt(process.env.KANBAN_AGENT_MAX_TURNS ?? String(config.agent.maxTurns), 10)),
        signal: new AbortController().signal,
        onEvent: (event) => {
          runtimeLogger.info('local codex event', {
            task_id: queued.id,
            task_key: queued.key,
            event: event.event,
            session_id: event.session_id,
            message: event.message,
          });
          logTaskActivity(queued.projectId, queued.id, null, 'codex_event', event);
        },
        refreshIssue: async () => {
          const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, queued.id)).get();
          if (!task) return null;
          const currentColumn = db.select().from(schema.columns).where(eq(schema.columns.id, task.columnId)).get();
          return taskToIssue(task, currentColumn?.nameEn ?? 'In Progress');
        },
        shouldContinue: () => {
          const newestMessage = db.select({ value: max(schema.comments.createdAt) }).from(schema.comments)
            .where(eq(schema.comments.taskId, queued.id))
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
          return false;
        },
        completionCheck: async () => checkAgentsCompletionGate({
          workspacePath,
          agentsContent: agentsContext.content,
          hasAgentBrowserEvidence: hasAgentBrowserEvidence(queued.id, runStartedAt),
        }),
      });

      const reviewColumn = db.select().from(schema.columns)
        .where(and(eq(schema.columns.projectId, queued.projectId), eq(schema.columns.key, 'in_review')))
        .get();
      db.update(schema.tasks).set({
        agentStatus: 'done',
        columnId: reviewColumn?.id ?? queued.columnId,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.tasks.id, queued.id)).run();
      logTaskActivity(queued.projectId, queued.id, null, 'codex_completed', { nextColumn: reviewColumn?.key ?? null });
      runtimeLogger.info('local codex task completed', { task_id: queued.id, task_key: queued.key });
    } catch (error) {
      db.update(schema.tasks).set({ agentStatus: 'failed', updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, queued.id))
        .run();
      logTaskActivity(queued.projectId, queued.id, null, 'codex_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      runtimeLogger.warn('local codex task failed', {
        task_id: queued.id,
        task_key: queued.key,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      const runningCount = (this.runningProjects.get(queued.projectId) ?? 1) - 1;
      if (runningCount > 0) this.runningProjects.set(queued.projectId, runningCount);
      else this.runningProjects.delete(queued.projectId);
    }
  }
}

function taskToIssue(task: typeof schema.tasks.$inferSelect, state: string): Issue {
  const attachments = db.select().from(schema.attachments)
    .where(eq(schema.attachments.taskId, task.id))
    .orderBy(asc(schema.attachments.createdAt))
    .all();
  const steering = db.select({
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    userName: schema.users.name,
  })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.taskId, task.id))
    .orderBy(asc(schema.comments.createdAt))
    .all();
  const detailBlocks = [
    task.description,
    attachments.length
      ? ['Attachments available to inspect:', ...attachments.map((file) => `- ${file.fileName}: ${file.storagePath}`)].join('\n')
      : null,
    steering.length
      ? ['Steering messages from the project team:', ...steering.map((message) => `- ${message.createdAt} ${message.userName}: ${message.body}`)].join('\n')
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
    labels: [`agent:${task.agentStatus}`],
    blocked_by: [],
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function hasAgentBrowserEvidence(taskId: string, after: string) {
  const value = db.select({ value: count() })
    .from(schema.activity)
    .where(and(
      eq(schema.activity.taskId, taskId),
      gt(schema.activity.createdAt, after),
      like(schema.activity.metadata, '%agent-browser%'),
    ))
    .get()?.value ?? 0;
  return value > 0;
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
