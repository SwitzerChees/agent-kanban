import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_AGENT_HARNESS,
  DEFAULT_CODEX_MODEL,
  DEFAULT_REASONING_EFFORT,
  isAgentHarness,
  isReasoningEffort,
} from '../../shared/agent-runtime';
import type { AgentHarness, ReasoningEffort } from '../../shared/agent-runtime';

export * from '../../shared/agent-runtime';

export const CODEX_MODEL = DEFAULT_CODEX_MODEL;
export const QWEN_MODEL_PROVIDER = 'homelab-qwen-3-8-27b';
export const QWEN_MODEL_ID = 'Qwen/Qwen3.8-27B';
export const QWEN_OPENCODE_MODEL = `${QWEN_MODEL_PROVIDER}/${QWEN_MODEL_ID}`;

export function resolveAgentHarness(value: unknown): AgentHarness {
  return isAgentHarness(value) ? value : DEFAULT_AGENT_HARNESS;
}

export function resolveReasoningEffort(value: unknown): ReasoningEffort {
  return isReasoningEffort(value) ? value : DEFAULT_REASONING_EFFORT;
}

export function harnessModel(harness: AgentHarness) {
  if (harness === 'claude') return DEFAULT_CLAUDE_MODEL;
  return harness === 'codex' ? CODEX_MODEL : QWEN_MODEL_ID;
}

export function harnessExecutable(harness: Exclude<AgentHarness, 'codex'>) {
  if (harness === 'claude') {
    return firstExecutable([
      process.env.KANBAN_CLAUDE_COMMAND,
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'claude')),
    ]);
  }
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
