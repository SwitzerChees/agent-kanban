import os from 'node:os';
import path from 'node:path';
import type { AgentConfig, CodexConfig, HooksConfig, ServiceConfig, ValidationResult, WorkflowDefinition } from './types';

const DEFAULT_ACTIVE_STATES = ['Todo', 'In Progress'];
const DEFAULT_TERMINAL_STATES = ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'];

export function resolveServiceConfig(workflow: WorkflowDefinition, env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const raw = workflow.config;
  const tracker = asRecord(raw.tracker);
  const polling = asRecord(raw.polling);
  const workspace = asRecord(raw.workspace);
  const hooks = asRecord(raw.hooks);
  const agent = asRecord(raw.agent);
  const codex = asRecord(raw.codex);
  const server = asRecord(raw.server);

  const trackerKind = stringValue(tracker.kind, 'linear').toLowerCase();
  if (trackerKind !== 'linear') {
    throw new Error(`unsupported_tracker_kind: ${trackerKind}`);
  }

  return {
    workflowPath: workflow.path,
    workflowDir: workflow.dir,
    tracker: {
      kind: 'linear',
      endpoint: stringValue(tracker.endpoint, 'https://api.linear.app/graphql'),
      apiKey: envRef(stringValue(tracker.api_key, env.LINEAR_API_KEY ? '$LINEAR_API_KEY' : ''), env),
      projectSlug: nullableString(tracker.project_slug),
      activeStates: stringList(tracker.active_states, DEFAULT_ACTIVE_STATES),
      terminalStates: stringList(tracker.terminal_states, DEFAULT_TERMINAL_STATES),
    },
    polling: {
      intervalMs: intValue(polling.interval_ms, 30000, 1),
    },
    workspace: {
      root: normalizePath(stringValue(workspace.root, path.join(os.tmpdir(), 'symphony_workspaces')), workflow.dir, env),
    },
    hooks: resolveHooks(hooks),
    agent: resolveAgent(agent),
    codex: resolveCodex(codex),
    server: {
      port: optionalInt(server.port),
    },
  };
}

export function validateDispatchConfig(config: ServiceConfig | null): ValidationResult {
  const issues = [];

  if (!config) {
    issues.push({ code: 'missing_config', message: 'No valid workflow configuration is loaded.' });
    return { ok: false, issues };
  }

  if (config.tracker.kind !== 'linear') {
    issues.push({ code: 'unsupported_tracker_kind', message: `Unsupported tracker kind: ${config.tracker.kind}` });
  }
  if (!config.tracker.apiKey) {
    issues.push({ code: 'missing_tracker_api_key', message: 'tracker.api_key is missing after environment resolution.' });
  }
  if (!config.tracker.projectSlug) {
    issues.push({ code: 'missing_tracker_project_slug', message: 'tracker.project_slug is required for Linear dispatch.' });
  }
  if (!config.codex.command.trim()) {
    issues.push({ code: 'missing_codex_command', message: 'codex.command must be present and non-empty.' });
  }

  return { ok: issues.length === 0, issues };
}

export function normalizeState(state: string): string {
  return state.toLowerCase();
}

export function isActiveState(config: ServiceConfig, state: string): boolean {
  const normalized = normalizeState(state);
  return config.tracker.activeStates.some((item) => normalizeState(item) === normalized);
}

export function isTerminalState(config: ServiceConfig, state: string): boolean {
  const normalized = normalizeState(state);
  return config.tracker.terminalStates.some((item) => normalizeState(item) === normalized);
}

function resolveHooks(raw: Record<string, unknown>): HooksConfig {
  return {
    afterCreate: nullableString(raw.after_create),
    beforeRun: nullableString(raw.before_run),
    afterRun: nullableString(raw.after_run),
    beforeRemove: nullableString(raw.before_remove),
    timeoutMs: intValue(raw.timeout_ms, 60000, 1),
  };
}

function resolveAgent(raw: Record<string, unknown>): AgentConfig {
  return {
    maxConcurrentAgents: intValue(raw.max_concurrent_agents, 10, 1),
    maxTurns: intValue(raw.max_turns, 20, 1),
    maxRetryBackoffMs: intValue(raw.max_retry_backoff_ms, 300000, 1),
    maxConcurrentAgentsByState: positiveIntegerMap(raw.max_concurrent_agents_by_state),
  };
}

function resolveCodex(raw: Record<string, unknown>): CodexConfig {
  return {
    command: stringValue(raw.command, 'codex app-server'),
    model: nullableString(raw.model),
    reasoningEffort: nullableString(raw.reasoning_effort),
    approvalPolicy: raw.approval_policy ?? null,
    threadSandbox: raw.thread_sandbox ?? null,
    turnSandboxPolicy: raw.turn_sandbox_policy ?? null,
    turnTimeoutMs: intValue(raw.turn_timeout_ms, 3600000, 1),
    readTimeoutMs: intValue(raw.read_timeout_ms, 5000, 1),
    stallTimeoutMs: intValue(raw.stall_timeout_ms, 300000, Number.MIN_SAFE_INTEGER),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length ? items : [...fallback];
}

function intValue(value: unknown, fallback: number, min: number): number {
  const numberValue = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue) || numberValue < min) {
    return fallback;
  }
  return numberValue;
}

function optionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
}

function positiveIntegerMap(value: unknown): Record<string, number> {
  const raw = asRecord(value);
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(raw)) {
    const parsed = Number.parseInt(String(item), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      out[normalizeState(key)] = parsed;
    }
  }
  return out;
}

function envRef(value: string, env: NodeJS.ProcessEnv): string | null {
  if (!value) return null;
  if (value.startsWith('$') && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.slice(1))) {
    const resolved = env[value.slice(1)]?.trim();
    return resolved || null;
  }
  return value;
}

function normalizePath(value: string, baseDir: string, env: NodeJS.ProcessEnv): string {
  let expanded = value;
  if (expanded === '~' || expanded.startsWith('~/')) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }
  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => env[name] ?? '');
  if (!path.isAbsolute(expanded)) {
    expanded = path.resolve(baseDir, expanded);
  }
  return path.normalize(expanded);
}
