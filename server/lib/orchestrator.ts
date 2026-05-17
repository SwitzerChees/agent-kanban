import { watch, type FSWatcher } from 'node:fs';
import { LinearClient } from './linear';
import { runtimeLogger } from './logger';
import { runCodexSession } from './codex';
import { isActiveState, isTerminalState, normalizeState, resolveServiceConfig, validateDispatchConfig } from './config';
import { loadWorkflow } from './workflow';
import { WorkspaceManager } from './workspace';
import type {
  CodexRuntimeEvent,
  Issue,
  RetryEntry,
  RunningEntry,
  RuntimeEventRecord,
  RuntimeSnapshot,
  ServiceConfig,
  ValidationResult,
  WorkflowDefinition,
} from './types';

interface TerminateOptions {
  cleanupWorkspace: boolean;
  retry: boolean;
  reason: string;
}

export class SymphonyOrchestrator {
  private workflow: WorkflowDefinition | null = null;
  private config: ServiceConfig | null = null;
  private validation: ValidationResult = validateDispatchConfig(null);
  private started = false;
  private running = new Map<string, RunningEntry>();
  private claimed = new Set<string>();
  private retryAttempts = new Map<string, RetryEntry>();
  private completed = new Set<string>();
  private codexTotals = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    seconds_running: 0,
  };
  private codexRateLimits: unknown | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;
  private tickQueued = false;
  private watcher: FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private lastReloadError: string | null = null;
  private lastTickAt: string | null = null;
  private lastPollError: string | null = null;

  constructor(private readonly workflowPath: string | null = process.env.SYMPHONY_WORKFLOW ?? null) {}

  async start() {
    if (this.started) return;
    this.started = true;

    await this.reloadWorkflow(true);
    this.startWatcher();

    if (this.validation.ok) {
      await this.startupTerminalWorkspaceCleanup();
    }

    this.scheduleTick(0);
  }

  stop() {
    this.started = false;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    for (const retry of this.retryAttempts.values()) clearTimeout(retry.timer_handle);
    for (const entry of this.running.values()) entry.worker.abort();
    this.retryAttempts.clear();
    this.running.clear();
    this.claimed.clear();
    this.watcher?.close();
    this.watcher = null;
  }

  async refreshNow(): Promise<{ queued: boolean; coalesced: boolean; requested_at: string; operations: string[] }> {
    const coalesced = this.tickQueued || this.tickInFlight;
    this.scheduleTick(0);
    return {
      queued: true,
      coalesced,
      requested_at: new Date().toISOString(),
      operations: ['poll', 'reconcile'],
    };
  }

  snapshot(): RuntimeSnapshot {
    const nowMs = Date.now();
    const running = [...this.running.values()].map((entry) => ({
      issue_id: entry.issue.id,
      issue_identifier: entry.identifier,
      state: entry.issue.state,
      session_id: entry.session_id,
      turn_count: entry.turn_count,
      last_event: entry.last_codex_event,
      last_message: entry.last_codex_message,
      started_at: entry.started_at,
      last_event_at: entry.last_codex_timestamp,
      workspace_path: entry.workspace_path,
      tokens: {
        input_tokens: entry.codex_input_tokens,
        output_tokens: entry.codex_output_tokens,
        total_tokens: entry.codex_total_tokens,
      },
    }));

    const retrying = [...this.retryAttempts.values()].map((entry) => ({
      issue_id: entry.issue_id,
      issue_identifier: entry.identifier,
      attempt: entry.attempt,
      due_at: entry.due_at,
      delay_ms: Math.max(entry.due_at_ms - nowMs, 0),
      error: entry.error,
    }));

    const activeSeconds = [...this.running.values()]
      .reduce((sum, entry) => sum + Math.max(nowMs - entry.started_at_ms, 0) / 1000, 0);

    return {
      generated_at: new Date().toISOString(),
      workflow_path: this.workflow?.path ?? this.workflowPath,
      validation: this.validation,
      health: {
        started: this.started,
        last_error: this.lastError,
        last_reload_error: this.lastReloadError,
        last_tick_at: this.lastTickAt,
        last_poll_error: this.lastPollError,
      },
      counts: {
        running: this.running.size,
        retrying: this.retryAttempts.size,
        completed: this.completed.size,
        claimed: this.claimed.size,
      },
      running,
      retrying,
      codex_totals: {
        input_tokens: this.codexTotals.input_tokens,
        output_tokens: this.codexTotals.output_tokens,
        total_tokens: this.codexTotals.total_tokens,
        seconds_running: this.codexTotals.seconds_running + activeSeconds,
      },
      rate_limits: this.codexRateLimits,
      recent_events: runtimeLogger.recent(80),
    };
  }

  issueDetails(identifier: string) {
    const running = [...this.running.values()].find((entry) => entry.identifier === identifier);
    const retry = [...this.retryAttempts.values()].find((entry) => entry.identifier === identifier);
    if (!running && !retry) return null;

    return {
      issue_identifier: identifier,
      issue_id: running?.issue.id ?? retry?.issue_id ?? null,
      status: running ? 'running' : 'retrying',
      workspace: {
        path: running?.workspace_path ?? null,
      },
      attempts: {
        restart_count: running?.retry_attempt ?? retry?.attempt ?? 0,
        current_retry_attempt: retry?.attempt ?? null,
      },
      running: running
        ? {
            session_id: running.session_id,
            turn_count: running.turn_count,
            state: running.issue.state,
            started_at: running.started_at,
            last_event: running.last_codex_event,
            last_message: running.last_codex_message,
            last_event_at: running.last_codex_timestamp,
            tokens: {
              input_tokens: running.codex_input_tokens,
              output_tokens: running.codex_output_tokens,
              total_tokens: running.codex_total_tokens,
            },
          }
        : null,
      retry: retry
        ? {
            attempt: retry.attempt,
            due_at: retry.due_at,
            error: retry.error,
          }
        : null,
      logs: {
        codex_session_logs: [],
      },
      recent_events: running?.recent_events ?? [],
      last_error: running?.last_error ?? retry?.error ?? null,
      tracked: {},
    };
  }

  private async reloadWorkflow(initial = false) {
    try {
      const workflow = await loadWorkflow(this.workflowPath);
      const config = resolveServiceConfig(workflow);
      this.workflow = workflow;
      this.config = config;
      this.validation = validateDispatchConfig(config);
      this.lastReloadError = null;
      runtimeLogger.info(initial ? 'workflow loaded' : 'workflow reloaded', {
        workflow_path: workflow.path,
        poll_interval_ms: config.polling.intervalMs,
      });
    } catch (error) {
      this.lastReloadError = error instanceof Error ? error.message : String(error);
      this.validation = this.config ? validateDispatchConfig(this.config) : validateDispatchConfig(null);
      runtimeLogger.error('workflow reload failed', { error: this.lastReloadError });
      if (initial) this.lastError = this.lastReloadError;
    }
  }

  private startWatcher() {
    if (!this.workflow?.path || this.watcher) return;
    this.watcher = watch(this.workflow.path, () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        void this.reloadWorkflow(false);
      }, 150);
    });
  }

  private scheduleTick(delayMs: number) {
    if (!this.started) return;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (this.tickInFlight) {
      this.tickQueued = true;
      return;
    }
    this.tickInFlight = true;
    this.tickQueued = false;
    this.lastTickAt = new Date().toISOString();

    try {
      await this.reloadWorkflow(false);
      await this.reconcileRunningIssues();

      const config = this.config;
      if (!config) return;

      this.validation = validateDispatchConfig(config);
      if (!this.validation.ok) {
        runtimeLogger.warn('dispatch skipped validation failed', { issues: this.validation.issues });
        return;
      }

      const issues = await new LinearClient(config).fetchCandidateIssues();
      this.lastPollError = null;
      for (const issue of sortForDispatch(issues)) {
        if (this.availableGlobalSlots() <= 0) break;
        if (this.shouldDispatch(issue)) {
          this.dispatchIssue(issue, null);
        }
      }
    } catch (error) {
      this.lastPollError = error instanceof Error ? error.message : String(error);
      runtimeLogger.warn('poll tick failed', { error: this.lastPollError });
    } finally {
      this.tickInFlight = false;
      const interval = this.config?.polling.intervalMs ?? 30000;
      this.scheduleTick(this.tickQueued ? 0 : interval);
    }
  }

  private dispatchIssue(issue: Issue, attempt: number | null) {
    const config = this.config;
    const workflow = this.workflow;
    if (!config || !workflow) return;

    if (this.running.has(issue.id)) return;

    const worker = new AbortController();
    const now = Date.now();
    const entry: RunningEntry = {
      issue,
      identifier: issue.identifier,
      started_at: new Date(now).toISOString(),
      started_at_ms: now,
      retry_attempt: attempt,
      workspace_path: null,
      worker,
      session_id: null,
      thread_id: null,
      turn_id: null,
      codex_app_server_pid: null,
      last_codex_event: null,
      last_codex_timestamp: null,
      last_codex_message: null,
      codex_input_tokens: 0,
      codex_output_tokens: 0,
      codex_total_tokens: 0,
      last_reported_input_tokens: 0,
      last_reported_output_tokens: 0,
      last_reported_total_tokens: 0,
      turn_count: 0,
      recent_events: [],
      last_error: null,
    };

    this.running.set(issue.id, entry);
    this.claimed.add(issue.id);
    const retry = this.retryAttempts.get(issue.id);
    if (retry) clearTimeout(retry.timer_handle);
    this.retryAttempts.delete(issue.id);

    runtimeLogger.info('issue dispatched', {
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      attempt: attempt ?? 'first',
    });

    void this.runIssueWorker(issue, attempt, config, workflow, worker.signal)
      .then(() => this.handleWorkerExit(issue.id, 'succeeded', null))
      .catch((error) => this.handleWorkerExit(issue.id, 'failed', error instanceof Error ? error.message : String(error)));
  }

  private async runIssueWorker(
    issue: Issue,
    attempt: number | null,
    config: ServiceConfig,
    workflow: WorkflowDefinition,
    signal: AbortSignal,
  ) {
    const workspaceManager = new WorkspaceManager(config.workspace.root, config.hooks);
    let workspacePath: string | null = null;

    try {
      const workspace = await workspaceManager.createForIssue(issue.identifier);
      workspacePath = workspace.path;
      const entry = this.running.get(issue.id);
      if (entry) entry.workspace_path = workspacePath;
      await workspaceManager.beforeRun(workspacePath);

      await runCodexSession({
        config: config.codex,
        workspacePath,
        issue,
        promptTemplate: workflow.prompt_template,
        attempt,
        maxTurns: config.agent.maxTurns,
        signal,
        onEvent: (event) => this.handleCodexEvent(issue.id, event),
        refreshIssue: async () => {
          const latestConfig = this.config ?? config;
          const issues = await new LinearClient(latestConfig).fetchIssueStatesByIds([issue.id]);
          return issues[0] ?? null;
        },
        shouldContinue: (currentIssue) => {
          const latestConfig = this.config ?? config;
          return isActiveState(latestConfig, currentIssue.state);
        },
      });
    } finally {
      if (workspacePath) {
        await workspaceManager.afterRun(workspacePath);
      }
    }
  }

  private handleWorkerExit(issueId: string, reason: 'succeeded' | 'failed', error: string | null) {
    const entry = this.running.get(issueId);
    if (!entry) return;

    this.running.delete(issueId);
    this.addRuntimeSeconds(entry);

    if (reason === 'succeeded') {
      this.completed.add(issueId);
      runtimeLogger.info('worker completed', { issue_id: issueId, issue_identifier: entry.identifier });
      this.scheduleRetry(issueId, entry.identifier, 1, null, 1000);
    } else {
      const nextAttempt = (entry.retry_attempt ?? 0) + 1;
      runtimeLogger.warn('worker failed retrying', {
        issue_id: issueId,
        issue_identifier: entry.identifier,
        attempt: nextAttempt,
        error,
      });
      this.scheduleRetry(issueId, entry.identifier, nextAttempt, error, this.failureBackoffMs(nextAttempt));
    }
  }

  private handleCodexEvent(issueId: string, event: CodexRuntimeEvent) {
    const entry = this.running.get(issueId);
    if (!entry) return;

    entry.codex_app_server_pid = event.codex_app_server_pid === undefined || event.codex_app_server_pid === null
      ? entry.codex_app_server_pid
      : String(event.codex_app_server_pid);
    entry.session_id = event.session_id ?? entry.session_id;
    entry.thread_id = event.thread_id ?? entry.thread_id;
    entry.turn_id = event.turn_id ?? entry.turn_id;
    entry.last_codex_event = event.event;
    entry.last_codex_timestamp = event.timestamp;
    entry.last_codex_message = event.message ?? null;
    if (event.event === 'session_started') entry.turn_count += 1;

    if (event.usage) {
      const input = event.usage.input_tokens ?? entry.last_reported_input_tokens;
      const output = event.usage.output_tokens ?? entry.last_reported_output_tokens;
      const total = event.usage.total_tokens ?? entry.last_reported_total_tokens;
      this.codexTotals.input_tokens += Math.max(input - entry.last_reported_input_tokens, 0);
      this.codexTotals.output_tokens += Math.max(output - entry.last_reported_output_tokens, 0);
      this.codexTotals.total_tokens += Math.max(total - entry.last_reported_total_tokens, 0);
      entry.last_reported_input_tokens = input;
      entry.last_reported_output_tokens = output;
      entry.last_reported_total_tokens = total;
      entry.codex_input_tokens = input;
      entry.codex_output_tokens = output;
      entry.codex_total_tokens = total;
    }

    if (event.rate_limits) {
      this.codexRateLimits = event.rate_limits;
    }

    const record: RuntimeEventRecord = {
      at: event.timestamp,
      event: event.event,
      message: event.message ?? null,
    };
    entry.recent_events.push(record);
    if (entry.recent_events.length > 80) entry.recent_events.shift();
  }

  private async reconcileRunningIssues() {
    const config = this.config;
    if (!config) return;

    await this.reconcileStalls(config);

    const runningIds = [...this.running.keys()];
    if (runningIds.length === 0) return;

    let refreshed: Issue[];
    try {
      refreshed = await new LinearClient(config).fetchIssueStatesByIds(runningIds);
    } catch (error) {
      runtimeLogger.warn('running state refresh failed', { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const byId = new Map(refreshed.map((issue) => [issue.id, issue]));
    for (const issueId of runningIds) {
      const entry = this.running.get(issueId);
      if (!entry) continue;
      const issue = byId.get(issueId);
      if (!issue) continue;
      if (isTerminalState(config, issue.state)) {
        await this.terminateRunningIssue(issueId, { cleanupWorkspace: true, retry: false, reason: 'terminal state' });
      } else if (isActiveState(config, issue.state)) {
        entry.issue = issue;
      } else {
        await this.terminateRunningIssue(issueId, { cleanupWorkspace: false, retry: false, reason: 'non-active state' });
      }
    }
  }

  private async reconcileStalls(config: ServiceConfig) {
    if (config.codex.stallTimeoutMs <= 0) return;
    const nowMs = Date.now();
    for (const [issueId, entry] of [...this.running]) {
      const lastActivity = entry.last_codex_timestamp ? Date.parse(entry.last_codex_timestamp) : entry.started_at_ms;
      if (Number.isFinite(lastActivity) && nowMs - lastActivity > config.codex.stallTimeoutMs) {
        await this.terminateRunningIssue(issueId, { cleanupWorkspace: false, retry: true, reason: 'stalled' });
      }
    }
  }

  private async terminateRunningIssue(issueId: string, options: TerminateOptions) {
    const entry = this.running.get(issueId);
    if (!entry) return;
    this.running.delete(issueId);
    entry.worker.abort();
    this.addRuntimeSeconds(entry);
    runtimeLogger.warn('worker terminated', {
      issue_id: issueId,
      issue_identifier: entry.identifier,
      reason: options.reason,
    });

    if (options.cleanupWorkspace && this.config) {
      await new WorkspaceManager(this.config.workspace.root, this.config.hooks).removeForIssue(entry.identifier);
    }

    if (options.retry) {
      const nextAttempt = (entry.retry_attempt ?? 0) + 1;
      this.scheduleRetry(issueId, entry.identifier, nextAttempt, options.reason, this.failureBackoffMs(nextAttempt));
    } else {
      this.claimed.delete(issueId);
    }
  }

  private scheduleRetry(issueId: string, identifier: string, attempt: number, error: string | null, delayMs: number) {
    const existing = this.retryAttempts.get(issueId);
    if (existing) clearTimeout(existing.timer_handle);
    this.claimed.add(issueId);
    const dueAtMs = Date.now() + delayMs;
    const timer = setTimeout(() => {
      void this.handleRetryTimer(issueId);
    }, delayMs);
    this.retryAttempts.set(issueId, {
      issue_id: issueId,
      identifier,
      attempt,
      due_at_ms: dueAtMs,
      due_at: new Date(dueAtMs).toISOString(),
      timer_handle: timer,
      error,
    });
  }

  private async handleRetryTimer(issueId: string) {
    const retry = this.retryAttempts.get(issueId);
    if (!retry || !this.config) return;
    this.retryAttempts.delete(issueId);

    let candidates: Issue[];
    try {
      candidates = await new LinearClient(this.config).fetchCandidateIssues();
    } catch {
      this.scheduleRetry(issueId, retry.identifier, retry.attempt + 1, 'retry poll failed', this.failureBackoffMs(retry.attempt + 1));
      return;
    }

    const issue = candidates.find((candidate) => candidate.id === issueId);
    if (!issue) {
      this.claimed.delete(issueId);
      return;
    }

    if (this.availableGlobalSlots() <= 0 || !this.hasStateSlot(issue)) {
      this.scheduleRetry(issueId, issue.identifier, retry.attempt + 1, 'no available orchestrator slots', this.failureBackoffMs(retry.attempt + 1));
      return;
    }

    this.dispatchIssue(issue, retry.attempt);
  }

  private async startupTerminalWorkspaceCleanup() {
    const config = this.config;
    if (!config) return;

    try {
      const issues = await new LinearClient(config).fetchIssuesByStates(config.tracker.terminalStates);
      const workspaceManager = new WorkspaceManager(config.workspace.root, config.hooks);
      await Promise.all(issues.map((issue) => workspaceManager.removeForIssue(issue.identifier)));
      runtimeLogger.info('startup workspace cleanup completed', { terminal_issues: issues.length });
    } catch (error) {
      runtimeLogger.warn('startup workspace cleanup failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private shouldDispatch(issue: Issue): boolean {
    const config = this.config;
    if (!config) return false;
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!isActiveState(config, issue.state)) return false;
    if (isTerminalState(config, issue.state)) return false;
    if (this.running.has(issue.id) || this.claimed.has(issue.id)) return false;
    if (this.availableGlobalSlots() <= 0) return false;
    if (!this.hasStateSlot(issue)) return false;
    if (normalizeState(issue.state) === 'todo') {
      const hasOpenBlocker = issue.blocked_by.some((blocker) => blocker.state && !isTerminalState(config, blocker.state));
      if (hasOpenBlocker) return false;
    }
    return true;
  }

  private availableGlobalSlots(): number {
    const max = this.config?.agent.maxConcurrentAgents ?? 0;
    return Math.max(max - this.running.size, 0);
  }

  private hasStateSlot(issue: Issue): boolean {
    const config = this.config;
    if (!config) return false;
    const state = normalizeState(issue.state);
    const limit = config.agent.maxConcurrentAgentsByState[state] ?? config.agent.maxConcurrentAgents;
    const current = [...this.running.values()].filter((entry) => normalizeState(entry.issue.state) === state).length;
    return current < limit;
  }

  private failureBackoffMs(attempt: number): number {
    const cap = this.config?.agent.maxRetryBackoffMs ?? 300000;
    return Math.min(10000 * 2 ** Math.max(attempt - 1, 0), cap);
  }

  private addRuntimeSeconds(entry: RunningEntry) {
    this.codexTotals.seconds_running += Math.max(Date.now() - entry.started_at_ms, 0) / 1000;
  }
}

function sortForDispatch(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER;
    const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const createdA = a.created_at ? Date.parse(a.created_at) : Number.MAX_SAFE_INTEGER;
    const createdB = b.created_at ? Date.parse(b.created_at) : Number.MAX_SAFE_INTEGER;
    if (createdA !== createdB) return createdA - createdB;
    return a.identifier.localeCompare(b.identifier);
  });
}
