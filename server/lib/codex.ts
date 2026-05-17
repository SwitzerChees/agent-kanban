import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CodexConfig, CodexRuntimeEvent, Issue } from './types';
import { renderPrompt } from './template';
import { runtimeLogger } from './logger';

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

interface RunCodexSessionOptions {
  config: CodexConfig;
  workspacePath: string;
  issue: Issue;
  promptTemplate: string;
  attempt: number | null;
  maxTurns: number;
  signal: AbortSignal;
  onEvent: (event: CodexRuntimeEvent) => void;
  refreshIssue: () => Promise<Issue | null>;
  shouldContinue: (issue: Issue) => boolean;
}

export async function runCodexSession(options: RunCodexSessionOptions): Promise<void> {
  const peer = new JsonRpcPeer(options.config.command, options.workspacePath, options.config.readTimeoutMs);
  let threadId: string | null = null;

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

    const threadResponse = await peer.request('thread/start', compactObject({
      cwd: options.workspacePath,
      approvalPolicy: options.config.approvalPolicy,
      sandbox: options.config.threadSandbox,
      ephemeral: true,
      serviceName: 'symphony',
    }));
    threadId = readPath<string>(threadResponse, ['thread', 'id']) ?? null;
    if (!threadId) {
      throw new Error('response_error: thread/start did not return thread.id');
    }

    let currentIssue = options.issue;
    for (let turnNumber = 1; turnNumber <= options.maxTurns; turnNumber += 1) {
      if (options.signal.aborted) throw new Error('turn_cancelled');

      const prompt = turnNumber === 1
        ? await renderPrompt(options.promptTemplate, currentIssue, options.attempt)
        : continuationPrompt(currentIssue, turnNumber, options.maxTurns);

      const turnResponse = await peer.request('turn/start', compactObject({
        threadId,
        cwd: options.workspacePath,
        approvalPolicy: options.config.approvalPolicy,
        sandboxPolicy: options.config.turnSandboxPolicy,
        input: [{ type: 'text', text: prompt }],
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

      await peer.waitForTurn(threadId, turnId, options.config.turnTimeoutMs, options.onEvent);

      const refreshedIssue = await options.refreshIssue();
      if (refreshedIssue) currentIssue = refreshedIssue;
      if (!options.shouldContinue(currentIssue)) break;
    }
  } finally {
    peer.stop('SIGTERM');
  }
}

class JsonRpcPeer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private requestId = 1;
  private buffer = '';
  private pending = new Map<string | number, PendingRequest>();
  private notificationHandlers = new Set<(message: JsonRpcMessage) => void>();

  constructor(
    private readonly command: string,
    private readonly cwd: string,
    private readonly readTimeoutMs: number,
  ) {}

  pid(): number | null {
    return this.child?.pid ?? null;
  }

  start(onMessage: (message: JsonRpcMessage) => void): Promise<void> {
    this.notificationHandlers.add(onMessage);
    this.child = spawn('bash', ['-lc', this.command], {
      cwd: this.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) runtimeLogger.debug('codex stderr', { message: message.slice(-1000) });
    });
    this.child.on('exit', (code, signal) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`port_exit: code=${code} signal=${signal ?? ''}`));
      }
      this.pending.clear();
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
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`turn_timeout: ${turnId}`));
      }, timeoutMs);

      const handler = (message: JsonRpcMessage) => {
        const method = message.method;
        const params = asRecord(message.params);
        if (method) {
          const event = eventFromNotification(method, params, threadId, turnId, this.pid());
          if (event) onEvent(event);
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
      };
      this.notificationHandlers.add(handler);
    });
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

    for (const handler of this.notificationHandlers) {
      handler(message);
    }
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
    onEvent({ event: 'approval_auto_approved', timestamp: now(), message: 'permission request accepted for session' });
    peer.respond(message.id, { permissions: { fileSystem: null, network: null }, scope: 'session' });
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
  };
}

function continuationPrompt(issue: Issue, turnNumber: number, maxTurns: number): string {
  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is continuation turn ${turnNumber} of ${maxTurns}.`,
    'Do not resend or restate the original task. Continue from the existing thread context, validate progress, and use the tracker workflow when appropriate.',
  ].join('\n');
}

function summarizeNotification(method: string, params: Record<string, unknown>): string {
  const title = readPath<string>(params, ['item', 'title'])
    ?? readPath<string>(params, ['item', 'command'])
    ?? readPath<string>(params, ['message'])
    ?? readPath<string>(params, ['error', 'message']);
  return title ? `${method}: ${title}` : method;
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
