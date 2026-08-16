import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AGENT_HARNESSES = ['codex', 'opencode', 'prime-agent'] as const;
export const REASONING_EFFORTS = ['low', 'medium', 'xhigh'] as const;

export type AgentHarness = typeof AGENT_HARNESSES[number];
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const DEFAULT_AGENT_HARNESS: AgentHarness = 'codex';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'xhigh';
export const CODEX_MODEL = 'gpt-5.6-sol';
export const QWEN_MODEL_PROVIDER = 'homelab-qwen-3-8-27b';
export const QWEN_MODEL_ID = 'Qwen/Qwen3.8-27B';
export const QWEN_OPENCODE_MODEL = `${QWEN_MODEL_PROVIDER}/${QWEN_MODEL_ID}`;

export function isAgentHarness(value: unknown): value is AgentHarness {
  return typeof value === 'string' && AGENT_HARNESSES.includes(value as AgentHarness);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

export function resolveAgentHarness(value: unknown): AgentHarness {
  return isAgentHarness(value) ? value : DEFAULT_AGENT_HARNESS;
}

export function resolveReasoningEffort(value: unknown): ReasoningEffort {
  return isReasoningEffort(value) ? value : DEFAULT_REASONING_EFFORT;
}

export function harnessModel(harness: AgentHarness) {
  return harness === 'codex' ? CODEX_MODEL : QWEN_MODEL_ID;
}

export function harnessExecutable(harness: Exclude<AgentHarness, 'codex'>) {
  if (harness === 'opencode') {
    return firstExecutable([
      process.env.KANBAN_OPENCODE_COMMAND,
      path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
      'opencode',
    ]);
  }

  const nvmBinCandidates = nvmVersionDirectories()
    .map((versionDirectory) => path.join(versionDirectory, 'bin', 'prime-agent'));
  return firstExecutable([
    process.env.KANBAN_PRIME_AGENT_COMMAND,
    path.join(os.homedir(), '.local', 'bin', 'prime-agent'),
    ...nvmBinCandidates,
    'prime-agent',
  ]);
}

function nvmVersionDirectories() {
  const versionsRoot = path.join(os.homedir(), '.nvm', 'versions', 'node');
  try {
    return fs.readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsRoot, entry.name))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function firstExecutable(candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!candidate.includes(path.sep)) return candidate;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next host-specific installation location.
    }
  }
  throw new Error('agent_harness_executable_not_found');
}
