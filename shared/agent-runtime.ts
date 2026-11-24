export const AGENT_HARNESSES = ['claude', 'codex', 'opencode', 'prime-agent'] as const;
export const CODEX_MODELS = ['gpt-6.2-sol', 'gpt-6.2-astra'] as const;
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-fable-5-2'] as const;
export const AGENT_MODELS = [...CLAUDE_MODELS, ...CODEX_MODELS] as const;
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const REASONING_EFFORTS = ['low', 'medium', 'xhigh'] as const;
export const TASK_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

export type AgentHarness = typeof AGENT_HARNESSES[number];
export type CodexModel = typeof CODEX_MODELS[number];
export type AgentModel = typeof AGENT_MODELS[number];
export type ReasoningEffort = typeof REASONING_EFFORTS[number];
export type TaskReasoningEffort = typeof TASK_REASONING_EFFORTS[number];

export const DEFAULT_AGENT_HARNESS: AgentHarness = 'claude';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
export const DEFAULT_CODEX_MODEL: CodexModel = 'gpt-6.2-sol';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'xhigh';
export const DEFAULT_TASK_REASONING_EFFORT: TaskReasoningEffort = 'xhigh';
export const TEXT_REFINEMENT_REASONING_EFFORT: ReasoningEffort = 'xhigh';
export const VISUAL_REFINEMENT_REASONING_EFFORT: ReasoningEffort = 'medium';

export function harnessForModel(model: AgentModel | undefined): AgentHarness {
  if (!model) return DEFAULT_AGENT_HARNESS;
  return (CODEX_MODELS as readonly AgentModel[]).includes(model) ? 'codex' : 'claude';
}

export function selectableModels(harness: AgentHarness): readonly AgentModel[] {
  if (harness === 'claude') return CLAUDE_MODELS;
  return harness === 'codex' ? CODEX_MODELS : [];
}

// Fixed-model harnesses retain the legacy Codex selection in storage.
export function modelForHarness(harness: AgentHarness, previous?: AgentModel): AgentModel {
  const models = harness === 'claude' ? CLAUDE_MODELS : CODEX_MODELS;
  return previous && (models as readonly AgentModel[]).includes(previous) ? previous : models[0];
}

export const MODEL_LABELS: Record<AgentModel, string> = {
  'claude-opus-5-5': 'Opus 5.5',
  'claude-fable-5-2': 'Fable 5.2',
  'gpt-6.2-sol': 'GPT-6.2 Sol',
  'gpt-6.2-astra': 'GPT-6.2 Astra',
};

export function isAgentHarness(value: unknown): value is AgentHarness {
  return typeof value === 'string' && AGENT_HARNESSES.includes(value as AgentHarness);
}

export function isAgentModel(value: unknown): value is AgentModel {
  return typeof value === 'string' && AGENT_MODELS.includes(value as AgentModel);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

export function isTaskReasoningEffort(value: unknown): value is TaskReasoningEffort {
  return typeof value === 'string' && TASK_REASONING_EFFORTS.includes(value as TaskReasoningEffort);
}

export function taskReasoningEfforts(harness: AgentHarness, model: AgentModel): readonly TaskReasoningEffort[] {
  if (modelForHarness(harness, model) !== model) return [];
  if (harness === 'claude') return CLAUDE_EFFORTS;
  return harness === 'codex' ? TASK_REASONING_EFFORTS : REASONING_EFFORTS;
}

export function isTaskRuntimeSelectionSupported(
  harness: AgentHarness,
  model: AgentModel,
  effort: TaskReasoningEffort,
) {
  return taskReasoningEfforts(harness, model).includes(effort);
}
