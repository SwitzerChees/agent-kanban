export type IssueStateName = string;

export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: IssueStateName;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: BlockerRef[];
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkflowDefinition {
  path: string;
  dir: string;
  config: Record<string, unknown>;
  prompt_template: string;
  loaded_at: string;
}

export type WorkflowErrorCode =
  | 'missing_workflow_file'
  | 'workflow_parse_error'
  | 'workflow_front_matter_not_a_map';

export class WorkflowError extends Error {
  code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.cause = cause;
  }
}

export interface TrackerConfig {
  kind: 'linear';
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface HooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
}

export interface CodexConfig {
  command: string;
  model: string | null;
  reasoningEffort: string | null;
  approvalPolicy: unknown | null;
  threadSandbox: unknown | null;
  turnSandboxPolicy: unknown | null;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface ServiceConfig {
  workflowPath: string;
  workflowDir: string;
  tracker: TrackerConfig;
  polling: {
    intervalMs: number;
  };
  workspace: {
    root: string;
  };
  hooks: HooksConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  server: {
    port: number | null;
  };
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface CodexUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface CodexRuntimeEvent {
  event: string;
  timestamp: string;
  codex_app_server_pid?: string | number | null;
  session_id?: string | null;
  thread_id?: string | null;
  turn_id?: string | null;
  message?: string | null;
  usage?: Partial<CodexUsage> | null;
  rate_limits?: unknown;
  raw?: unknown;
}

export interface RunningEntry {
  issue: Issue;
  identifier: string;
  started_at: string;
  started_at_ms: number;
  retry_attempt: number | null;
  workspace_path: string | null;
  worker: AbortController;
  session_id: string | null;
  thread_id: string | null;
  turn_id: string | null;
  codex_app_server_pid: string | null;
  last_codex_event: string | null;
  last_codex_timestamp: string | null;
  last_codex_message: string | null;
  codex_input_tokens: number;
  codex_output_tokens: number;
  codex_total_tokens: number;
  last_reported_input_tokens: number;
  last_reported_output_tokens: number;
  last_reported_total_tokens: number;
  turn_count: number;
  recent_events: RuntimeEventRecord[];
  last_error: string | null;
}

export interface RetryEntry {
  issue_id: string;
  identifier: string;
  attempt: number;
  due_at_ms: number;
  due_at: string;
  timer_handle: NodeJS.Timeout;
  error: string | null;
}

export interface RuntimeEventRecord {
  at: string;
  event: string;
  message: string | null;
}

export interface RuntimeSnapshot {
  generated_at: string;
  workflow_path: string | null;
  validation: ValidationResult;
  health: {
    started: boolean;
    last_error: string | null;
    last_reload_error: string | null;
    last_tick_at: string | null;
    last_poll_error: string | null;
  };
  counts: {
    running: number;
    retrying: number;
    completed: number;
    claimed: number;
  };
  running: Array<{
    issue_id: string;
    issue_identifier: string;
    state: string;
    session_id: string | null;
    turn_count: number;
    last_event: string | null;
    last_message: string | null;
    started_at: string;
    last_event_at: string | null;
    workspace_path: string | null;
    tokens: CodexUsage;
  }>;
  retrying: Array<{
    issue_id: string;
    issue_identifier: string;
    attempt: number;
    due_at: string;
    delay_ms: number;
    error: string | null;
  }>;
  codex_totals: CodexUsage & {
    seconds_running: number;
  };
  rate_limits: unknown | null;
  recent_events: RuntimeEventRecord[];
}
