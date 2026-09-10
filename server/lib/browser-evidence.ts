import type { CodexRuntimeEvent } from './types';

// Prose, command starts, skill reads and the gate's own error are not test evidence.
export function completedBrowserEvidence(event: Pick<CodexRuntimeEvent, 'event' | 'raw'>): string | null {
  if (event.event !== 'item/completed') return null;
  const raw = event.raw as { item?: { type?: string; command?: string; exitCode?: number; status?: string } } | undefined;
  const item = raw?.item;
  if (item?.type !== 'commandExecution' || item.exitCode !== 0 || item.status !== 'completed') return null;
  const command = item.command ?? '';
  // Accept one actual invocation, optionally wrapped by the shell used by Codex.
  // Do not infer success from a pipeline, echo, skill reader or compound command.
  const wrapped = command.match(/^(?:\/[\w/-]+\/)?(?:bash|sh) -lc (["'])([\s\S]*)\1$/);
  const invocation = (wrapped?.[2] ?? command).trim();
  if (/[;&|\n\x60]|\$\(/.test(invocation)) return null;
  if (!/^(?:\S*\/)?agent-browser\s+(?:(?:--[\w-]+)(?:\s+[^\s]+)?\s+)*(?:open|snapshot|screenshot|click|find|eval)\b/.test(invocation)) return null;
  return invocation.slice(0, 1000);
}
