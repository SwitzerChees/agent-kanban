import { spawn } from 'node:child_process';
import type { CodexRuntimeEvent, Issue } from './types';
import { renderPrompt } from './template';
import {
  QWEN_MODEL_ID,
  QWEN_MODEL_PROVIDER,
  QWEN_OPENCODE_MODEL,
  harnessExecutable,
  type AgentHarness,
  type ReasoningEffort,
} from './agent-harness';

type ExternalHarness = Exclude<AgentHarness, 'codex'>;

interface CompletionCheckResult {
  ok: boolean;
  message?: string | null;
  prompt?: string | null;
  metadata?: unknown;
}

interface RunExternalAgentSessionOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  issue: Issue;
  promptTemplate: string;
  promptPrefix?: string | null;
  attempt: number | null;
  maxTurns: number;
  turnTimeoutMs: number;
  signal: AbortSignal;
  onEvent: (event: CodexRuntimeEvent) => void;
  refreshIssue: () => Promise<Issue | null>;
  shouldContinue: (issue: Issue) => boolean;
  completionCheck?: (issue: Issue) => Promise<CompletionCheckResult | null>;
}

export interface RunExternalRefinementOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
  onEvent?: (event: CodexRuntimeEvent) => void;
}

export async function runExternalAgentSession(options: RunExternalAgentSessionOptions) {
  let currentIssue = options.issue;
  let nextPrompt: string | null = null;

  for (let turnNumber = 1; turnNumber <= options.maxTurns; turnNumber += 1) {
    assertNotAborted(options.signal);
    const renderedPrompt = turnNumber === 1
      ? await renderPrompt(options.promptTemplate, currentIssue, options.attempt)
      : nextPrompt ?? continuationPrompt(currentIssue, turnNumber, options.maxTurns);
    nextPrompt = null;
    const prompt = options.promptPrefix?.trim()
      ? `${options.promptPrefix.trim()}\n\n---\n\n${renderedPrompt}`
      : renderedPrompt;

    await runExternalProcess({
      harness: options.harness,
      reasoningEffort: options.reasoningEffort,
      workspacePath: options.workspacePath,
      prompt,
      signal: options.signal,
      timeoutMs: options.turnTimeoutMs,
      autonomous: true,
      turnNumber,
      onEvent: options.onEvent,
    });

    const refreshedIssue = await options.refreshIssue();
    if (refreshedIssue) currentIssue = refreshedIssue;
    const completionCheck = await options.completionCheck?.(currentIssue);
    if (completionCheck && !completionCheck.ok) {
      options.onEvent({
        event: 'completion_gate_failed',
        timestamp: now(),
        message: completionCheck.message ?? 'completion gate failed',
        raw: completionCheck.metadata,
      });
      if (turnNumber >= options.maxTurns || !completionCheck.prompt) {
        throw new Error(`completion_gate_failed: ${completionCheck.message ?? 'missing completion requirements'}`);
      }
      nextPrompt = completionCheck.prompt;
      continue;
    }
    if (completionCheck?.ok) {
      options.onEvent({
        event: 'completion_gate_passed',
        timestamp: now(),
        message: completionCheck.message ?? 'completion gate passed',
        raw: completionCheck.metadata,
      });
    }
    if (!options.shouldContinue(currentIssue)) break;
    const continuationIssue = await options.refreshIssue();
    if (continuationIssue) currentIssue = continuationIssue;
  }
}

export async function runExternalRefinementTurn(options: RunExternalRefinementOptions) {
  const prompt = [
    options.prompt,
    '',
    'The required structured output must validate against this JSON Schema:',
    JSON.stringify(options.outputSchema),
    '',
    'Return the JSON object only. Do not wrap it in a Markdown fence or add commentary.',
  ].join('\n');
  const result = await runExternalProcess({
    harness: options.harness,
    reasoningEffort: options.reasoningEffort,
    workspacePath: options.workspacePath,
    prompt,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    autonomous: false,
    turnNumber: 1,
    onEvent: options.onEvent ?? (() => {}),
  });
  return {
    output: parseJsonObject(result.text),
    threadId: result.sessionId,
    images: [] as Array<{ id: string; status: string; revisedPrompt: string | null; savedPath: string | null; result: string }>,
  };
}

interface RunExternalProcessOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  autonomous: boolean;
  turnNumber: number;
  onEvent: (event: CodexRuntimeEvent) => void;
}

async function runExternalProcess(options: RunExternalProcessOptions) {
  assertNotAborted(options.signal);
  const executable = harnessExecutable(options.harness);
  const args = buildExternalArgs(options);
  const child = spawn(executable, args, {
    cwd: options.workspacePath,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdoutBuffer = '';
  let stderrTail = '';
  let text = '';
  let sessionId: string | null = null;
  let emittedAssistantText = '';

  options.onEvent({
    event: 'session_started',
    timestamp: now(),
    codex_app_server_pid: child.pid ?? null,
    session_id: null,
    message: `${options.harness} turn ${options.turnNumber} started`,
  });

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      if (!trimmed.startsWith('[')) text += `${trimmed}\n`;
      return;
    }
    sessionId = stringValue(event.sessionID) ?? stringValue(event.sessionId) ?? stringValue(event.id) ?? sessionId;
    const fragment = assistantText(event, options.harness, emittedAssistantText);
    if (!fragment) return;
    emittedAssistantText += fragment;
    text += fragment;
    options.onEvent({
      event: 'item/agentMessage/delta',
      timestamp: now(),
      codex_app_server_pid: child.pid ?? null,
      session_id: sessionId,
      thread_id: sessionId,
      message: fragment,
      raw: event,
    });
  };

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    while (true) {
      const newline = stdoutBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      consumeLine(line);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-8_000);
  });

  const exit = await waitForExit(child, options.signal, options.timeoutMs);
  if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
  if (exit.code !== 0) {
    const detail = stderrTail.trim().slice(-2_000);
    throw new Error(`${options.harness}_exit_${exit.code ?? exit.signal ?? 'unknown'}${detail ? `: ${detail}` : ''}`);
  }
  if (!text.trim()) throw new Error(`${options.harness}_empty_response`);

  options.onEvent({
    event: 'item/completed',
    timestamp: now(),
    codex_app_server_pid: child.pid ?? null,
    session_id: sessionId,
    thread_id: sessionId,
    message: text.trim(),
  });
  return { text: text.trim(), sessionId };
}

export function buildExternalArgs(options: RunExternalProcessOptions) {
  if (options.harness === 'opencode') {
    return [
      'run',
      '--format', 'json',
      '--model', QWEN_OPENCODE_MODEL,
      '--variant', options.reasoningEffort,
      ...(options.autonomous ? ['--auto'] : ['--agent', 'explore']),
      '--title', `Agent Kanban ${options.autonomous ? 'implementation' : 'refinement'}`,
      options.prompt,
    ];
  }
  return [
    '--print',
    '--mode', 'json',
    '--cwd', options.workspacePath,
    '--provider', QWEN_MODEL_PROVIDER,
    '--model', QWEN_MODEL_ID,
    '--thinking', options.reasoningEffort,
    '--no-session',
    ...(options.autonomous
      ? ['--autonomous', '--autonomous-max-turns', '12', '--autonomous-timeout-ms', String(options.timeoutMs)]
      : []),
    '--',
    options.prompt,
  ];
}

function assistantText(event: Record<string, unknown>, harness: ExternalHarness, emitted: string) {
  if (harness === 'opencode') {
    if (event.type === 'text') {
      return stringValue(asRecord(event.part).text) ?? stringValue(event.text) ?? '';
    }
    return '';
  }

  if (event.type === 'message_update') {
    const delta = asRecord(event.delta);
    return stringValue(delta.text) ?? stringValue(delta.delta) ?? '';
  }
  if (event.type !== 'message_end') return '';
  const message = asRecord(event.message);
  if (message.role !== 'assistant') return '';
  const fullText = contentText(message.content);
  if (!fullText) return '';
  return fullText.startsWith(emitted) ? fullText.slice(emitted.length) : fullText;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    const content = asRecord(item);
    return content.type === 'text' ? stringValue(content.text) ?? '' : '';
  }).join('');
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const terminate = (reason: Error) => {
      if (settled) return;
      child.kill('SIGTERM');
      const forceTimer = setTimeout(() => child.kill('SIGKILL'), 3_000);
      forceTimer.unref();
      settled = true;
      cleanup();
      reject(reason);
    };
    const onAbort = () => terminate(new Error('turn_cancelled'));
    const timer = setTimeout(() => terminate(new Error('turn_timeout')), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('exit', (code, exitSignal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ code, signal: exitSignal });
    });
  });
}

export function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(withoutFence.slice(start, end + 1));
    throw new Error('external_harness_invalid_json');
  }
}

function continuationPrompt(issue: Issue, turnNumber: number, maxTurns: number) {
  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is continuation turn ${turnNumber} of ${maxTurns}.`,
    'Apply the latest task context below, finish the requested implementation, and validate it before handing off.',
    '',
    issue.description?.trim() || '(No additional task context is currently attached.)',
  ].join('\n');
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Error('turn_cancelled');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length ? value : null;
}

function now() {
  return new Date().toISOString();
}
