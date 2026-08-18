import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
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
import { parseAgentWaitRequest } from './agent-wait';
import type { TaskHarnessRuntimeOptions, TaskHarnessSessionResult } from './codex';
import {
  buildTaskHarnessRunner,
  prepareTaskHarnessSession,
  stopTaskHarnessUnit,
} from './task-harness-sandbox';

type ExternalHarness = Exclude<AgentHarness, 'codex'>;

const PRIME_REFINEMENT_TOOL_BUDGET_EXTENSION = path.resolve(
  process.cwd(),
  'server',
  'prime-extensions',
  'refinement-tool-budget.ts',
);

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
  nativeSessionId?: string | null;
  onSession?: (nativeSessionId: string) => void;
  runtime?: Omit<TaskHarnessRuntimeOptions, 'unitName'> & { unitNamePrefix: string };
}

export interface RunExternalRefinementOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  validateOutput?: (value: unknown) => unknown;
  nativeSessionId?: string | null;
  sessionRoot?: string;
  signal: AbortSignal;
  timeoutMs: number;
  onEvent?: (event: CodexRuntimeEvent) => void;
}

export async function runExternalAgentSession(options: RunExternalAgentSessionOptions): Promise<TaskHarnessSessionResult> {
  let currentIssue = options.issue;
  let nextPrompt: string | null = null;
  let nativeSessionId = options.nativeSessionId ?? null;

  for (let turnNumber = 1; turnNumber <= options.maxTurns; turnNumber += 1) {
    assertNotAborted(options.signal);
    const renderedPrompt = turnNumber === 1
      ? await renderPrompt(options.promptTemplate, currentIssue, options.attempt)
      : nextPrompt ?? continuationPrompt(currentIssue, turnNumber, options.maxTurns);
    nextPrompt = null;
    const prompt = options.promptPrefix?.trim()
      ? `${options.promptPrefix.trim()}\n\n---\n\n${renderedPrompt}`
      : renderedPrompt;

    const result = await runExternalProcess({
      harness: options.harness,
      reasoningEffort: options.reasoningEffort,
      workspacePath: options.workspacePath,
      prompt,
      signal: options.signal,
      timeoutMs: options.turnTimeoutMs,
      autonomous: true,
      turnNumber,
      onEvent: options.onEvent,
      nativeSessionId,
      onSession: (sessionId) => {
        nativeSessionId = sessionId;
        options.onSession?.(sessionId);
      },
      sessionRoot: options.runtime?.sessionRoot,
      runtime: options.runtime ? {
        ...options.runtime,
        unitName: `${options.runtime.unitNamePrefix}-${turnNumber}`,
      } : undefined,
    });
    if (result.sessionId && result.sessionId !== nativeSessionId) {
      nativeSessionId = result.sessionId;
      options.onSession?.(nativeSessionId);
    }
    const waitRequest = parseAgentWaitRequest(result.text);
    if (waitRequest) return { nativeSessionId, waitRequest };

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
  return { nativeSessionId, waitRequest: null };
}

export async function runExternalRefinementTurn(options: RunExternalRefinementOptions) {
  if (options.sessionRoot) await mkdir(path.join(options.sessionRoot, 'prime-sessions'), { recursive: true });
  let nativeSessionId = options.nativeSessionId ?? null;
  let lastError: unknown = null;
  let previousResponse: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const repair = attempt > 1;
    const result = await runExternalProcess({
      harness: options.harness,
      reasoningEffort: options.reasoningEffort,
      workspacePath: options.workspacePath,
      prompt: buildExternalRefinementPrompt(options, repair, previousResponse),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      autonomous: false,
      turnNumber: attempt,
      onEvent: options.onEvent ?? (() => {}),
      // Prime's daemon can keep a completed, auto-compacted session registered
      // for several seconds while its worker shuts down. A structured-output
      // repair does not need repository history, so start it in a fresh session
      // and include the invalid response in the repair prompt instead of racing
      // the daemon's session cleanup.
      nativeSessionId: externalRefinementSessionId(options.harness, repair, nativeSessionId),
      sessionRoot: options.sessionRoot,
    });
    nativeSessionId = result.sessionId ?? nativeSessionId;
    try {
      const parsed = parseJsonObject(result.text);
      const output = options.validateOutput ? options.validateOutput(parsed) : parsed;
      return {
        output,
        threadId: nativeSessionId,
        images: [] as Array<{ id: string; status: string; revisedPrompt: string | null; savedPath: string | null; result: string }>,
      };
    } catch (error) {
      lastError = error;
      previousResponse = result.text;
    }
  }
  throw lastError ?? new Error('external_harness_invalid_json');
}

export function externalRefinementSessionId(
  harness: ExternalHarness,
  repair: boolean,
  nativeSessionId: string | null,
) {
  return repair && harness === 'prime-agent' ? null : nativeSessionId;
}

export function buildExternalRefinementPrompt(
  options: Pick<RunExternalRefinementOptions, 'harness' | 'prompt' | 'outputSchema'>,
  repair = false,
  previousResponse: string | null = null,
) {
  return [
    repair
      ? 'Your previous response did not match the required structure. Correct it now without doing more repository inspection.'
      : options.prompt,
    ...(repair && previousResponse
      ? ['', 'Previous response to correct:', previousResponse]
      : []),
    ...(options.harness === 'prime-agent' && !repair
      ? [
          '',
          'Prime Agent inspection budget: batch related repository reads and use no more than 16 tool calls. When the tool budget is exhausted, stop inspecting and return the best grounded structured result immediately.',
        ]
      : []),
    '',
    'The required structured output must validate against this JSON Schema:',
    JSON.stringify(options.outputSchema),
    '',
    'Return exactly one JSON object and nothing else. Do not use a Markdown fence or add commentary before or after it. Include every required field even when its value is an empty array.',
  ].join('\n');
}

export interface RunExternalProcessOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  autonomous: boolean;
  turnNumber: number;
  onEvent: (event: CodexRuntimeEvent) => void;
  nativeSessionId?: string | null;
  onSession?: (nativeSessionId: string) => void;
  sessionRoot?: string;
  runtime?: TaskHarnessRuntimeOptions;
}

async function runExternalProcess(options: RunExternalProcessOptions) {
  assertNotAborted(options.signal);
  const executable = harnessExecutable(options.harness);
  const args = buildExternalArgs(options);
  let runner: ReturnType<typeof buildTaskHarnessRunner> | null = null;
  if (options.runtime && options.sessionRoot) {
    await prepareTaskHarnessSession(options.sessionRoot);
    runner = buildTaskHarnessRunner({
      unitName: options.runtime.unitName,
      executable,
      args,
      workspacePath: options.workspacePath,
      sessionRoot: options.sessionRoot,
      harness: options.harness,
    });
    options.runtime.onUnit?.(runner.unitName, runner.browserSession);
  }
  const child = spawn(runner?.command ?? executable, runner?.args ?? args, {
    cwd: options.workspacePath,
    env: runner?.env ?? { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
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
    const discoveredSessionId = externalSessionId(event, options.harness);
    if (discoveredSessionId && discoveredSessionId !== sessionId) {
      sessionId = discoveredSessionId;
      options.onSession?.(discoveredSessionId);
    }
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

  try {
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
  } finally {
    await stopTaskHarnessUnit(runner?.unitName);
    options.runtime?.onUnit?.(null, null);
  }
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
      ...(options.nativeSessionId ? ['--session', options.nativeSessionId] : []),
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
    ...(!options.autonomous ? ['--extension', PRIME_REFINEMENT_TOOL_BUDGET_EXTENSION] : []),
    ...(options.sessionRoot ? ['--session-dir', path.join(options.sessionRoot, 'prime-sessions')] : ['--no-session']),
    ...(options.nativeSessionId ? ['--resume', options.nativeSessionId] : []),
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
    const assistantEvent = asRecord(event.assistantMessageEvent);
    if (assistantEvent.type !== 'text_delta') return '';
    const delta = asRecord(event.delta);
    return stringValue(assistantEvent.delta) ?? stringValue(delta.text) ?? stringValue(delta.delta) ?? '';
  }
  if (event.type !== 'message_end') return '';
  const message = asRecord(event.message);
  if (message.role !== 'assistant') return '';
  const fullText = contentText(message.content);
  if (!fullText) return '';
  return remainingAssistantText(fullText, emitted);
}

export function remainingAssistantText(fullText: string, emitted: string) {
  if (!emitted) return fullText;
  if (fullText.startsWith(emitted)) return fullText.slice(emitted.length);

  // Prime can stream the visible JSON without its leading whitespace and then
  // include that whitespace again in the final message_end snapshot. Treat
  // both forms as the same content so one response never becomes two adjacent
  // JSON objects in the refinement parser.
  const normalizedFullText = fullText.trimStart();
  const normalizedEmitted = emitted.trimStart();
  return normalizedFullText.startsWith(normalizedEmitted)
    ? normalizedFullText.slice(normalizedEmitted.length)
    : fullText;
}

function externalSessionId(event: Record<string, unknown>, harness: ExternalHarness) {
  if (harness === 'prime-agent' && event.type === 'session') return stringValue(event.id);
  return stringValue(event.sessionID)
    ?? stringValue(event.sessionId)
    ?? stringValue(event.session_id)
    ?? stringValue(asRecord(event.session).id)
    ?? null;
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
