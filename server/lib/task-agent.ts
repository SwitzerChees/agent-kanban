import { runCodexSession, type CodexSteeringBatch } from './codex';
import { runExternalAgentSession } from './external-agent';
import { isReasoningEffort, type AgentHarness, type AgentModel, type TaskReasoningEffort } from './agent-harness';

export async function runTaskAgentHarness(options: Omit<Parameters<typeof runCodexSession>[0], 'loadSteering'> & {
  loadSteering?: () => Promise<CodexSteeringBatch | null>;
  harness: AgentHarness;
  model: AgentModel;
  reasoningEffort: TaskReasoningEffort;
}) {
  const { harness, model, reasoningEffort, config, loadSteering, ...common } = options;
  if (harness === 'codex') {
    return runCodexSession({
      ...common,
      loadSteering,
      config: {
        ...config,
        model,
        reasoningEffort,
      },
    });
  }

  if (harness !== 'claude' && !isReasoningEffort(reasoningEffort)) {
    throw new Error('unsupported_external_agent_reasoning_effort');
  }

  return runExternalAgentSession({
    harness,
    model,
    loadSteering: harness === 'claude' ? loadSteering : undefined,
    reasoningEffort,
    turnTimeoutMs: config.turnTimeoutMs,
    ...common,
    runtime: common.runtime ? {
      unitNamePrefix: common.runtime.unitName,
      sessionRoot: common.runtime.sessionRoot,
      extraEnv: common.runtime.extraEnv,
      workspaceWritable: common.runtime.workspaceWritable,
      isolatedHome: common.runtime.isolatedHome,
      protectAgentCredentials: common.runtime.protectAgentCredentials,
      onUnit: common.runtime.onUnit,
    } : undefined,
  });
}
