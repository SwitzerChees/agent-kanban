import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CodexConfig, CodexRuntimeEvent, Issue } from './types';
import { renderPrompt } from './template';
import { runtimeLogger } from './logger';
import { parseAgentWaitRequest, type AgentWaitRequest } from './agent-wait';
import {
  buildTaskHarnessRunner,
  prepareTaskHarnessSession,
  stopTaskHarnessUnit,
} from './task-harness-sandbox';

type JsonRpcMessage = {
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface CompletionCheckResult {
  ok: boolean;
  message?: string | null;
  prompt?: string | null;
  metadata?: unknown;
}

export type CodexUserInput =
  | { type: 'text'; text: string; text_elements?: unknown[] }
  | { type: 'localImage'; path: string; detail?: 'high' | 'original' };

export interface CodexSteeringBatch {
  input: CodexUserInput[];
  description?: string | null;
  markDelivered?: () => void;
}

export interface TaskHarnessRuntimeOptions {
  unitName: string;
  sessionRoot: string;
  onUnit?: (unitName: string | null, browserSession: string | null) => void;
}

interface RunCodexSessionOptions {
  config: CodexConfig;
  workspacePath: string;
  issue: Issue;
  promptTemplate: string;
  promptPrefix?: string | null;
  attempt: number | null;
  maxTurns: number;
  signal: AbortSignal;
  onEvent: (event: CodexRuntimeEvent) => void;
  refreshIssue: () => Promise<Issue | null>;
  shouldContinue: (issue: Issue) => boolean;
  loadSteering?: (context: { threadId: string; turnId: string; turnNumber: number }) => Promise<CodexSteeringBatch | null>;
  steeringPollMs?: number;
  completionCheck?: (issue: Issue) => Promise<CompletionCheckResult | null>;
  nativeSessionId?: string | null;
  onSession?: (nativeSessionId: string) => void;
  runtime?: TaskHarnessRuntimeOptions;
}

export interface TaskHarnessSessionResult {
  nativeSessionId: string | null;
  waitRequest: AgentWaitRequest | null;
}

export function taskCodexSandboxOverrides(
  runtime: boolean,
  threadSandbox: CodexConfig['threadSandbox'],
  turnSandboxPolicy: CodexConfig['turnSandboxPolicy'],
) {
  return runtime
    ? {
        sandbox: 'danger-full-access' as const,
        sandboxPolicy: { type: 'dangerFullAccess' as const },
      }
    : { sandbox: threadSandbox, sandboxPolicy: turnSandboxPolicy };
}

export async function runCodexSession(options: RunCodexSessionOptions): Promise<TaskHarnessSessionResult> {
  let runner: ReturnType<typeof buildTaskHarnessRunner> | null = null;
  if (options.runtime) {
    await prepareTaskHarnessSession(options.runtime.sessionRoot);
    runner = buildTaskHarnessRunner({
      unitName: options.runtime.unitName,
      executable: '/bin/bash',
      args: ['-lc', options.config.command],
      workspacePath: options.workspacePath,
      sessionRoot: options.runtime.sessionRoot,
      harness: 'codex',
    });
    options.runtime.onUnit?.(runner.unitName, runner.browserSession);
  }
  const peer = new JsonRpcPeer(
    runner?.command ?? '/bin/bash',
    runner?.args ?? ['-lc', options.config.command],
    runner?.env ?? process.env,
    options.workspacePath,
    options.config.readTimeoutMs,
  );
  let threadId: string | null = options.nativeSessionId ?? null;

  options.signal.addEventListener('abort', () => peer.stop('SIGTERM'), { once: true });

  try {
    await peer.start((message) => handleServerMessage(peer, message, options.onEvent));
    options.onEvent({
      event: 'app_server_started',
      timestamp: now(),
      codex_app_server_pid: peer.pid(),
      message: 'Codex app-server process started',
    });

    await peer.request('initialize', {
      clientInfo: {
        name: 'symphony-nuxt',
        title: 'Symphony',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    peer.notify('initialized', {});

    const sandboxOverrides = taskCodexSandboxOverrides(
      Boolean(options.runtime),
      options.config.threadSandbox,
      options.config.turnSandboxPolicy,
    );
    const threadParams = compactObject({
      cwd: options.workspacePath,
      model: options.config.model,
      approvalPolicy: options.config.approvalPolicy,
      // The transient systemd unit already confines task access to the worktree and
      // session directories. Running Codex's bwrap sandbox inside that unit breaks
      // network namespace setup (the nested sandbox cannot configure loopback).
      sandbox: sandboxOverrides.sandbox,
    });
    const threadResponse = threadId
      ? await peer.request('thread/resume', { ...threadParams, threadId, excludeTurns: true })
      : await peer.request('thread/start', {
          ...threadParams,
          ephemeral: false,
          serviceName: 'agent-kanban-task',
        });
    threadId = readPath<string>(threadResponse, ['thread', 'id']) ?? null;
    if (!threadId) {
      throw new Error('response_error: thread/start did not return thread.id');
    }
    options.onSession?.(threadId);

    let currentIssue = options.issue;
    let nextPrompt: string | null = null;
    for (let turnNumber = 1; turnNumber <= options.maxTurns; turnNumber += 1) {
      if (options.signal.aborted) throw new Error('turn_cancelled');

      const renderedPrompt = turnNumber === 1
        ? await renderPrompt(options.promptTemplate, currentIssue, options.attempt)
        : nextPrompt ?? continuationPrompt(currentIssue, turnNumber, options.maxTurns);
      nextPrompt = null;
      const prompt = options.promptPrefix?.trim()
        ? `${options.promptPrefix.trim()}\n\n---\n\n${renderedPrompt}`
        : renderedPrompt;

      const turnResponse = await peer.request('turn/start', compactObject({
        threadId,
        cwd: options.workspacePath,
        model: options.config.model,
        effort: options.config.reasoningEffort,
        approvalPolicy: options.config.approvalPolicy,
        sandboxPolicy: sandboxOverrides.sandboxPolicy,
        input: [textInput(prompt)],
      }));

      const turnId = readPath<string>(turnResponse, ['turn', 'id']);
      if (!turnId) {
        throw new Error('response_error: turn/start did not return turn.id');
      }

      options.onEvent({
        event: 'session_started',
        timestamp: now(),
        codex_app_server_pid: peer.pid(),
        session_id: `${threadId}-${turnId}`,
        thread_id: threadId,
        turn_id: turnId,
        message: `turn ${turnNumber} started`,
      });

      const stopSteeringPump = options.loadSteering
        ? startSteeringPump(peer, {
            threadId,
            turnId,
            turnNumber,
            pollMs: options.steeringPollMs ?? 2000,
            loadSteering: options.loadSteering,
            onEvent: options.onEvent,
          })
        : async () => {};

      try {
        await peer.waitForTurn(threadId, turnId, options.config.turnTimeoutMs, options.onEvent);
      } finally {
        await stopSteeringPump();
      }

      const waitRequest = parseAgentWaitRequest(peer.consumeAgentText(threadId, turnId));
      if (waitRequest) return { nativeSessionId: threadId, waitRequest };

      const refreshedIssue = await options.refreshIssue();
      if (refreshedIssue) currentIssue = refreshedIssue;
      const completionCheck = await options.completionCheck?.(currentIssue);
      if (completionCheck && !completionCheck.ok) {
        options.onEvent({
          event: 'completion_gate_failed',
          timestamp: now(),
          codex_app_server_pid: peer.pid(),
          session_id: `${threadId}-${turnId}`,
          thread_id: threadId,
          turn_id: turnId,
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
          codex_app_server_pid: peer.pid(),
          session_id: `${threadId}-${turnId}`,
          thread_id: threadId,
          turn_id: turnId,
          message: completionCheck.message ?? 'completion gate passed',
          raw: completionCheck.metadata,
        });
      }
      if (!options.shouldContinue(currentIssue)) break;
      const continuationIssue = await options.refreshIssue();
      if (continuationIssue) currentIssue = continuationIssue;
    }
    return { nativeSessionId: threadId, waitRequest: null };
  } finally {
    peer.stop('SIGTERM');
    await stopTaskHarnessUnit(runner?.unitName);
    options.runtime?.onUnit?.(null, null);
  }
}

class JsonRpcPeer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private requestId = 1;
  private buffer = '';
  private pending = new Map<string | number, PendingRequest>();
  private notificationHandlers = new Set<(message: JsonRpcMessage) => void>();
  private agentText = new Map<string, string>();
  private exitHandlers = new Set<(error: Error) => void>();
  private exitError: Error | null = null;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: NodeJS.ProcessEnv,
    private readonly cwd: string,
    private readonly readTimeoutMs: number,
  ) {}

  pid(): number | null {
    return this.child?.pid ?? null;
  }

  start(onMessage: (message: JsonRpcMessage) => void): Promise<void> {
    this.notificationHandlers.add(onMessage);
    this.exitError = null;
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) runtimeLogger.debug('codex stderr', { message: message.slice(-1000) });
    });
    this.child.on('exit', (code, signal) => {
      const error = new Error(`port_exit: code=${code} signal=${signal ?? ''}`);
      this.exitError = error;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      for (const handler of this.exitHandlers) handler(error);
    });

    return Promise.resolve();
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.requestId++;
    const child = this.requireChild();
    const message = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`response_timeout: ${method}`));
      }, this.readTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  notify(method: string, params: unknown) {
    const child = this.requireChild();
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  respond(id: string | number, result: unknown) {
    const child = this.requireChild();
    child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  respondError(id: string | number, code: number, message: string) {
    const child = this.requireChild();
    child.stdin.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
  }

  waitForTurn(
    threadId: string,
    turnId: string,
    timeoutMs: number,
    onEvent: (event: CodexRuntimeEvent) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.exitError) {
        reject(this.exitError);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`turn_timeout: ${turnId}`));
      }, timeoutMs);
      const onExit = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handler = (message: JsonRpcMessage) => {
        const method = message.method;
        const params = asRecord(message.params);
        if (method) {
          const event = eventFromNotification(method, params, threadId, turnId, this.pid());
          if (event) {
            onEvent(event);
          }
        }

        if (method === 'turn/completed' && params.threadId === threadId && readPath(params, ['turn', 'id']) === turnId) {
          const status = readPath<string>(params, ['turn', 'status', 'type']) ?? readPath<string>(params, ['turn', 'status']);
          cleanup();
          if (status && status !== 'completed') {
            reject(new Error(`turn_failed: ${status}`));
          } else {
            resolve();
          }
        }

        if (method === 'error') {
          cleanup();
          reject(new Error(`turn_failed: ${JSON.stringify(params)}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.notificationHandlers.delete(handler);
        this.exitHandlers.delete(onExit);
      };
      this.notificationHandlers.add(handler);
      this.exitHandlers.add(onExit);
    });
  }

  consumeAgentText(threadId: string, turnId: string) {
    const key = `${threadId}:${turnId}`;
    const text = this.agentText.get(key) ?? '';
    this.agentText.delete(key);
    return text;
  }

  stop(signal: NodeJS.Signals) {
    const child = this.child;
    if (!child) return;
    if (!child.killed) {
      child.kill(signal);
    }
    this.child = null;
  }

  private requireChild(): ChildProcessWithoutNullStreams {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('codex_not_found');
    }
    return this.child;
  }

  private handleStdout(chunk: Buffer) {
    this.buffer += chunk.toString('utf8');
    while (true) {
      const index = this.buffer.indexOf('\n');
      if (index < 0) break;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string) {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      runtimeLogger.warn('codex malformed', { message: line.slice(0, 1000) });
      return;
    }

    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined) && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? `response_error: ${message.error.code ?? 'unknown'}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.captureAgentNotification(message);

    for (const handler of this.notificationHandlers) {
      handler(message);
    }
  }

  private captureAgentText(event: CodexRuntimeEvent, threadId: string, turnId: string) {
    const key = `${threadId}:${turnId}`;
    if (event.event === 'item/agentMessage/delta') {
      this.agentText.set(key, `${this.agentText.get(key) ?? ''}${event.message ?? ''}`);
      return;
    }
    if (event.event !== 'item/completed') return;
    const raw = asRecord(event.raw);
    const item = asRecord(raw.item);
    const type = String(item.type ?? '').toLowerCase();
    if (!type.includes('agent') || !type.includes('message')) return;
    const full = extractText(item.text ?? item.content);
    if (full) this.agentText.set(key, full);
  }

  private captureAgentNotification(message: JsonRpcMessage) {
    if (!message.method) return;
    const params = asRecord(message.params);
    const threadId = typeof params.threadId === 'string' ? params.threadId : null;
    const turnId = typeof params.turnId === 'string'
      ? params.turnId
      : readPath<string>(params, ['turn', 'id']) ?? null;
    if (!threadId || !turnId) return;
    const event = eventFromNotification(message.method, params, threadId, turnId, this.pid());
    if (event) this.captureAgentText(event, threadId, turnId);
  }
}

function handleServerMessage(peer: JsonRpcPeer, message: JsonRpcMessage, onEvent: (event: CodexRuntimeEvent) => void) {
  if (message.id === undefined || !message.method) return;

  if (message.method === 'item/commandExecution/requestApproval') {
    onEvent({ event: 'approval_auto_approved', timestamp: now(), message: 'command approval accepted for session' });
    peer.respond(message.id, { decision: 'acceptForSession' });
    return;
  }

  if (message.method === 'item/fileChange/requestApproval' || message.method === 'applyPatchApproval') {
    onEvent({ event: 'approval_auto_approved', timestamp: now(), message: 'file change approval accepted for session' });
    peer.respond(message.id, { decision: 'acceptForSession' });
    return;
  }

  if (message.method === 'execCommandApproval') {
    onEvent({ event: 'approval_auto_approved', timestamp: now(), message: 'legacy exec approval accepted for session' });
    peer.respond(message.id, { decision: 'approved' });
    return;
  }

  if (message.method === 'item/permissions/requestApproval') {
    onEvent({ event: 'approval_denied', timestamp: now(), message: 'permission escalation denied outside the task workspace' });
    peer.respond(message.id, { permissions: {}, scope: 'turn' });
    return;
  }

  if (message.method === 'item/tool/call') {
    onEvent({ event: 'unsupported_tool_call', timestamp: now(), message: 'dynamic tool call is not implemented' });
    peer.respond(message.id, {
      success: false,
      contentItems: [{ type: 'inputText', text: 'Unsupported tool call in Symphony runtime.' }],
    });
    return;
  }

  if (message.method === 'item/tool/requestUserInput' || message.method === 'mcpServer/elicitation/request') {
    onEvent({ event: 'turn_input_required', timestamp: now(), message: 'user input requested; failing request by policy' });
    peer.respondError(message.id, -32000, 'Symphony does not support interactive user input during agent runs.');
    return;
  }

  peer.respondError(message.id, -32601, `Unsupported server request: ${message.method}`);
}

function eventFromNotification(
  method: string,
  params: Record<string, unknown>,
  threadId: string,
  turnId: string,
  pid: number | null,
): CodexRuntimeEvent | null {
  const timestamp = now();
  if (method === 'thread/tokenUsage/updated') {
    const total = asRecord(asRecord(params.tokenUsage).total);
    return {
      event: method,
      timestamp,
      codex_app_server_pid: pid,
      session_id: `${threadId}-${turnId}`,
      thread_id: threadId,
      turn_id: turnId,
      usage: {
        input_tokens: numberValue(total.inputTokens),
        output_tokens: numberValue(total.outputTokens),
        total_tokens: numberValue(total.totalTokens),
      },
      message: 'token usage updated',
    };
  }

  if (method === 'account/rateLimits/updated') {
    return {
      event: method,
      timestamp,
      codex_app_server_pid: pid,
      session_id: `${threadId}-${turnId}`,
      thread_id: threadId,
      turn_id: turnId,
      rate_limits: params.rateLimits ?? params,
      message: 'rate limits updated',
    };
  }

  return {
    event: method,
    timestamp,
    codex_app_server_pid: pid,
    session_id: `${threadId}-${turnId}`,
    thread_id: threadId,
    turn_id: turnId,
    message: summarizeNotification(method, params),
    raw: params,
  };
}

function continuationPrompt(issue: Issue, turnNumber: number, maxTurns: number): string {
  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is continuation turn ${turnNumber} of ${maxTurns}.`,
    'New steering, attachments, or task metadata may have been added while you were working. Apply the current task context below before continuing.',
    '',
    issue.description?.trim() || '(No additional task context is currently attached.)',
    '',
    'Continue from the existing thread context, validate progress, and use the tracker workflow when appropriate.',
  ].join('\n');
}

function startSteeringPump(
  peer: JsonRpcPeer,
  options: {
    threadId: string;
    turnId: string;
    turnNumber: number;
    pollMs: number;
    loadSteering: NonNullable<RunCodexSessionOptions['loadSteering']>;
    onEvent: RunCodexSessionOptions['onEvent'];
  },
): () => Promise<void> {
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let lastFailure: string | null = null;

  const pump = () => {
    if (stopped || inFlight) return;
    inFlight = (async () => {
      try {
        const batch = await options.loadSteering({
          threadId: options.threadId,
          turnId: options.turnId,
          turnNumber: options.turnNumber,
        });
        if (stopped || !batch?.input.length) return;

        const response = await peer.request('turn/steer', {
          threadId: options.threadId,
          expectedTurnId: options.turnId,
          input: batch.input,
        });
        batch.markDelivered?.();
        lastFailure = null;
        options.onEvent({
          event: 'turn_steered',
          timestamp: now(),
          codex_app_server_pid: peer.pid(),
          session_id: `${options.threadId}-${options.turnId}`,
          thread_id: options.threadId,
          turn_id: options.turnId,
          message: batch.description ?? 'steering delivered to active turn',
          raw: { inputCount: batch.input.length, response },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== lastFailure) {
          lastFailure = message;
          options.onEvent({
            event: 'turn_steer_failed',
            timestamp: now(),
            codex_app_server_pid: peer.pid(),
            session_id: `${options.threadId}-${options.turnId}`,
            thread_id: options.threadId,
            turn_id: options.turnId,
            message,
          });
        }
      }
    })().finally(() => {
      inFlight = null;
    });
  };

  const timer = setInterval(pump, Math.max(options.pollMs, 250));
  pump();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight?.catch(() => {});
  };
}

function textInput(text: string): CodexUserInput {
  return { type: 'text', text, text_elements: [] };
}

function summarizeNotification(method: string, params: Record<string, unknown>): string {
  const agentMessage = naturalTextFromParams(params);
  if (method === 'item/agentMessage/delta' && agentMessage) return agentMessage;

  const title = readPath<string>(params, ['item', 'title'])
    ?? readPath<string>(params, ['item', 'command'])
    ?? readPath<string>(params, ['message'])
    ?? readPath<string>(params, ['error', 'message']);
  return title ? `${method}: ${title}` : method;
}

function naturalTextFromParams(params: Record<string, unknown>): string | null {
  const candidates = [
    params.delta,
    params.text,
    params.message,
    readPath(params, ['delta', 'text']),
    readPath(params, ['item', 'text']),
    readPath(params, ['item', 'message']),
    readPath(params, ['item', 'content']),
  ];

  for (const candidate of candidates) {
    const text = extractText(candidate);
    if (text) return text;
  }
  return null;
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const text = value.map(extractText).filter(Boolean).join('');
    return text.trim() ? text : null;
  }
  const record = asRecord(value);
  if (typeof record.text === 'string' && record.text.trim()) return record.text;
  if (typeof record.content === 'string' && record.content.trim()) return record.content;
  return null;
}

function readPath<T>(value: unknown, keys: string[]): T | undefined {
  let current = value;
  for (const key of keys) {
    const record = asRecord(current);
    current = record[key];
    if (current === undefined || current === null) return undefined;
  }
  return current as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)) as T;
}

function now(): string {
  return new Date().toISOString();
}
