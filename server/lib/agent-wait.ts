export const AGENT_WAIT_KINDS = ['ci', 'deployment', 'rate_limit', 'other'] as const;

export type AgentWaitKind = typeof AGENT_WAIT_KINDS[number];

export interface AgentWaitRequest {
  kind: AgentWaitKind;
  reason: string;
  resumeAfterSeconds: number;
}

const WAIT_PATTERN = /<agent-kanban-wait>(\{[^<]+\})<\/agent-kanban-wait>\s*$/;
const MIN_WAIT_SECONDS = 60;
const MAX_WAIT_SECONDS = 15 * 60;

export function agentWaitInstructions() {
  return [
    'External waiting protocol:',
    '- You remain responsible for this task from implementation through PR, CI, deployment, and required E2E verification.',
    '- If all productive work is complete for now and only an external system is pending, do not poll continuously.',
    '- End your response with exactly one machine-readable wait request:',
    '<agent-kanban-wait>{"kind":"ci","reason":"Short factual reason","resumeAfterSeconds":300}</agent-kanban-wait>',
    `- kind must be one of: ${AGENT_WAIT_KINDS.join(', ')}. resumeAfterSeconds must be between ${MIN_WAIT_SECONDS} and ${MAX_WAIT_SECONDS}.`,
    '- Use this only for genuinely external waiting. Never use it for work, tests, fixes, commits, or reviews you can perform now.',
    '- After Agent Kanban resumes this same session, verify the external condition yourself and continue the full workflow.',
  ].join('\n');
}

export function parseAgentWaitRequest(text: string | null | undefined): AgentWaitRequest | null {
  if (!text) return null;
  const raw = text.match(WAIT_PATTERN)?.[1];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const kind = parsed.kind;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const requestedSeconds = typeof parsed.resumeAfterSeconds === 'number'
      ? parsed.resumeAfterSeconds
      : Number.NaN;
    if (!AGENT_WAIT_KINDS.includes(kind as AgentWaitKind) || !reason || !Number.isFinite(requestedSeconds)) {
      return null;
    }
    return {
      kind: kind as AgentWaitKind,
      reason: reason.slice(0, 500),
      resumeAfterSeconds: Math.min(MAX_WAIT_SECONDS, Math.max(MIN_WAIT_SECONDS, Math.round(requestedSeconds))),
    };
  } catch {
    return null;
  }
}
