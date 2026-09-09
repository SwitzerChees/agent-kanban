export const AGENT_HARNESSES = ['codex', 'opencode', 'prime-agent'] as const;
export const CODEX_MODELS = ['gpt-5.6-sol', 'gpt-6-astra'] as const;
export const REASONING_EFFORTS = ['low', 'medium', 'xhigh'] as const;
export const TASK_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

export type AgentHarness = typeof AGENT_HARNESSES[number];
export type CodexModel = typeof CODEX_MODELS[number];
export type ReasoningEffort = typeof REASONING_EFFORTS[number];
export type TaskReasoningEffort = typeof TASK_REASONING_EFFORTS[number];

export const DEFAULT_AGENT_HARNESS: AgentHarness = 'codex';
export const DEFAULT_CODEX_MODEL: CodexModel = 'gpt-5.6-sol';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'xhigh';
export const DEFAULT_TASK_REASONING_EFFORT: TaskReasoningEffort = 'xhigh';
export const TEXT_REFINEMENT_REASONING_EFFORT: ReasoningEffort = 'xhigh';
export const VISUAL_REFINEMENT_REASONING_EFFORT: ReasoningEffort = 'medium';

const CODEX_MODEL_REASONING_EFFORTS: Record<CodexModel, readonly TaskReasoningEffort[]> = {
  'gpt-5.6-sol': TASK_REASONING_EFFORTS,
  'gpt-6-astra': TASK_REASONING_EFFORTS,
};

export function isAgentHarness(value: unknown): value is AgentHarness {
  return typeof value === 'string' && AGENT_HARNESSES.includes(value as AgentHarness);
}

export function isCodexModel(value: unknown): value is CodexModel {
  return typeof value === 'string' && CODEX_MODELS.includes(value as CodexModel);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

export function isTaskReasoningEffort(value: unknown): value is TaskReasoningEffort {
  return typeof value === 'string' && TASK_REASONING_EFFORTS.includes(value as TaskReasoningEffort);
}

export function taskReasoningEfforts(harness: AgentHarness, model: CodexModel): readonly TaskReasoningEffort[] {
  return harness === 'codex' ? CODEX_MODEL_REASONING_EFFORTS[model] : REASONING_EFFORTS;
}

export function isTaskRuntimeSelectionSupported(
  harness: AgentHarness,
  model: CodexModel,
  effort: TaskReasoningEffort,
) {
  return taskReasoningEfforts(harness, model).includes(effort);
}
