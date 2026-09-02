import { execFile, spawn } from 'node:child_process';
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
export const EXTERNAL_REFINEMENT_MAX_ATTEMPTS = 3;

const PRIME_REFINEMENT_TOOL_BUDGET_EXTENSION = path.resolve(
  process.cwd(),
  'server',
  'prime-extensions',
  'refinement-tool-budget.ts',
);
const PRIME_TASK_READY_GATE = path.resolve(
  process.cwd(),
  'server',
  'prime-gates',
  'task-ready.mjs',
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
  skipImplementationGate?: boolean;
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
    const prompt = externalTaskPrompt(renderedPrompt, options.promptPrefix, nativeSessionId);

    const result = await runExternalProcess({
      harness: options.harness,
      reasoningEffort: options.reasoningEffort,
      workspacePath: options.workspacePath,
      prompt,
      signal: options.signal,
      timeoutMs: options.turnTimeoutMs,
      autonomous: true,
      // A successful threshold compaction can intentionally end a headless
      // Prime process without a final text message. The host-side staged gate
      // decides the next prompt from durable Git state instead of treating
      // that normal compaction boundary as a process crash.
      allowEmptyResponse: options.harness === 'prime-agent',
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
    const implementationCheck = options.harness === 'prime-agent' && !options.skipImplementationGate
      ? await checkPrimeTaskReady(options.workspacePath, options.signal)
      : null;
    const mergedPullRequestAlreadyProvesCommit = completionCheck?.ok === true
      && asRecord(completionCheck.metadata).requiresPullRequest === true;
    const failedCheck = implementationCheck && !implementationCheck.ok && !mergedPullRequestAlreadyProvesCommit
      ? implementationCheck
      : completionCheck && !completionCheck.ok
        ? completionCheck
        : null;
    if (failedCheck) {
      options.onEvent({
        event: failedCheck === implementationCheck ? 'implementation_gate_failed' : 'completion_gate_failed',
        timestamp: now(),
        message: failedCheck.message ?? 'completion gate failed',
        raw: failedCheck.metadata,
      });
      if (turnNumber >= options.maxTurns || !failedCheck.prompt) {
        throw new Error(`completion_gate_failed: ${failedCheck.message ?? 'missing completion requirements'}`);
      }
      nextPrompt = failedCheck.prompt;
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
  let validationFeedback: string | null = null;

  for (let attempt = 1; attempt <= EXTERNAL_REFINEMENT_MAX_ATTEMPTS; attempt += 1) {
    const repair = attempt > 1;
    const result = await runExternalProcess({
      harness: options.harness,
      reasoningEffort: options.reasoningEffort,
      workspacePath: options.workspacePath,
      prompt: buildExternalRefinementPrompt(options, repair, previousResponse, validationFeedback),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      autonomous: false,
      allowEmptyResponse: true,
      disableTools: repair,
      turnNumber: attempt,
      onEvent: options.onEvent ?? (() => {}),
      // Malformed output is repaired in a fresh Prime session with the invalid
      // response embedded in its prompt. An empty response after compaction is
      // different: resume that session after its daemon worker has shut down so
      // Prime can answer from the compacted repository context.
      nativeSessionId: externalRefinementSessionId(options.harness, repair, previousResponse, nativeSessionId),
      sessionRoot: options.sessionRoot,
    });
    nativeSessionId = result.sessionId ?? nativeSessionId;
    if (!result.text.trim()) {
      lastError = new Error(`${options.harness}_empty_response`);
      previousResponse = null;
      validationFeedback = null;
      if (repair) break;
      if (options.harness === 'prime-agent' && nativeSessionId) {
        await abortableDelay(6_500, options.signal);
      }
      continue;
    }
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
      validationFeedback = refinementValidationFeedback(error);
    }
  }
  throw lastError ?? new Error('external_harness_invalid_json');
}

export function externalRefinementSessionId(
  harness: ExternalHarness,
  repair: boolean,
  previousResponse: string | null,
  nativeSessionId: string | null,
) {
  return repair && previousResponse !== null && harness === 'prime-agent' ? null : nativeSessionId;
}

export function buildExternalRefinementPrompt(
  options: Pick<RunExternalRefinementOptions, 'harness' | 'prompt' | 'outputSchema'>,
  repair = false,
  previousResponse: string | null = null,
  validationFeedback: string | null = null,
) {
  return [
    repair
      ? previousResponse === null
        ? 'Your previous turn completed automatic compaction before producing a final response. Continue from the compacted context now. Do not inspect the repository further or call tools; return the required final structured result immediately.'
        : 'Your previous response did not match the required structure. Correct it now without doing more repository inspection.'
      : options.prompt,
    ...(repair && previousResponse
      ? ['', 'Previous response to correct:', previousResponse]
      : []),
    ...(repair && validationFeedback
      ? ['', 'Validation feedback that must be fixed:', validationFeedback]
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

export function refinementValidationFeedback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 2_000) || 'The response failed validation.';
}

export interface RunExternalProcessOptions {
  harness: ExternalHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  autonomous: boolean;
  allowEmptyResponse?: boolean;
  disableTools?: boolean;
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
      extraEnv: options.runtime.extraEnv,
      workspaceWritable: options.runtime.workspaceWritable,
      isolatedHome: options.runtime.isolatedHome,
      protectAgentCredentials: options.runtime.protectAgentCredentials,
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
  let streamedAssistantText = '';

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
    const runtimeProgress = options.harness === 'prime-agent' ? primeRuntimeProgress(event) : null;
    if (runtimeProgress) {
      options.onEvent({
        ...runtimeProgress,
        timestamp: now(),
        codex_app_server_pid: child.pid ?? null,
        session_id: sessionId,
        thread_id: sessionId,
        raw: event,
      });
    }
    const primeFragment = options.harness === 'prime-agent'
      ? primeAssistantFragment(event, streamedAssistantText)
      : null;
    const fragment = primeFragment?.fragment ?? assistantText(event, options.harness, streamedAssistantText);
    if (primeFragment) streamedAssistantText = primeFragment.streamedText;
    if (!fragment) return;
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
    if (!text.trim()) {
      if (options.allowEmptyResponse) return { text: '', sessionId };
      throw new Error(`${options.harness}_empty_response`);
    }

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
    ...(options.disableTools ? ['--no-tools'] : []),
    ...(!options.autonomous ? ['--extension', PRIME_REFINEMENT_TOOL_BUDGET_EXTENSION] : []),
    ...(options.sessionRoot ? ['--session-dir', path.join(options.sessionRoot, 'prime-sessions')] : ['--no-session']),
    ...(options.nativeSessionId ? ['--resume', options.nativeSessionId] : []),
    // Agent Kanban owns task continuations and staged completion gates. Prime's
    // autonomous counters are cumulative token/turn budgets, not context-window
    // protection, and restarting them around a resumed session can burn through
    // the same task twice. Prime's native session compaction remains enabled.
    '--',
    options.prompt,
  ];
}

export function externalTaskPrompt(
  renderedPrompt: string,
  promptPrefix: string | null | undefined,
  nativeSessionId: string | null,
) {
  const prefix = promptPrefix?.trim();
  return prefix && !nativeSessionId
    ? `${prefix}\n\n---\n\n${renderedPrompt}`
    : renderedPrompt;
}

export function checkPrimeTaskReady(workspacePath: string, signal?: AbortSignal): Promise<CompletionCheckResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, [PRIME_TASK_READY_GATE], {
      cwd: workspacePath,
      encoding: 'utf8',
      timeout: 30_000,
      signal,
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve({
          ok: true,
          message: stdout.trim() || 'Local implementation checkpoint passed.',
          metadata: { stage: 'implementation', workspacePath },
        });
        return;
      }
      const detail = (stderr || stdout || error.message).trim().slice(-4_000);
      resolve({
        ok: false,
        message: `Local implementation checkpoint failed: ${detail || 'task branch is not ready'}`,
        prompt: buildImplementationRepairPrompt(detail),
        metadata: { stage: 'implementation', workspacePath, detail },
      });
    });
  });
}

function buildImplementationRepairPrompt(detail: string) {
  return [
    'The local implementation checkpoint is not complete. Continue this same task; do not start the Pull Request handoff yet.',
    '',
    `Checkpoint: ${detail || 'The task branch is not yet clean and committed.'}`,
    '',
    'Required actions:',
    '- Preserve and inspect all existing task-worktree changes. Never reset, clean, or discard earlier task progress.',
    '- Finish the requested implementation and its local validation.',
    '- Commit coherent milestones as they become valid; do not leave the whole implementation only in the working tree.',
    '- Before reporting the implementation ready, leave the task branch clean with at least one task commit ahead of origin/master.',
  ].join('\n');
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

export function primeRuntimeProgress(event: Record<string, unknown>): Pick<CodexRuntimeEvent, 'event' | 'message'> | null {
  if (event.type === 'compaction_start') {
    const reason = stringValue(event.reason) ?? 'automatic';
    return {
      event: 'prime/compaction_started',
      message: `Prime Agent is compacting its context (${reason}).`,
    };
  }
  if (event.type === 'compaction_end') {
    const reason = stringValue(event.reason) ?? 'automatic';
    const error = stringValue(event.errorMessage);
    return {
      event: error ? 'prime/compaction_failed' : 'prime/compaction_completed',
      message: error
        ? `Prime Agent context compaction failed (${reason}): ${error.slice(0, 1_000)}`
        : `Prime Agent context compaction completed (${reason}).`,
    };
  }
  if (event.type === 'tool_execution_start' && primeToolUsesAgentBrowser(event)) {
    return {
      event: 'prime/agent_browser_started',
      message: 'Prime Agent started an agent-browser verification.',
    };
  }
  return null;
}

function primeToolUsesAgentBrowser(event: Record<string, unknown>) {
  const toolName = stringValue(event.toolName) ?? stringValue(event.tool_name) ?? '';
  let argumentsText = '';
  try {
    argumentsText = JSON.stringify(event.args ?? event.arguments ?? event.input ?? '').slice(0, 20_000);
  } catch {
    argumentsText = '';
  }
  return `${toolName}\n${argumentsText}`.toLowerCase().includes('agent-browser');
}

export function primeAssistantFragment(event: Record<string, unknown>, streamedText: string) {
  const fragment = assistantText(event, 'prime-agent', streamedText);
  if (event.type === 'message_update') {
    return { fragment, streamedText: `${streamedText}${fragment}` };
  }
  if (event.type === 'message_end') {
    return { fragment, streamedText: '' };
  }
  return { fragment, streamedText };
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

function abortableDelay(ms: number, signal: AbortSignal) {
  assertNotAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('turn_cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
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
