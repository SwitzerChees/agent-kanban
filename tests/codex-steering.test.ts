import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCodexSession } from '../server/lib/codex';
import type { CodexRuntimeEvent, Issue } from '../server/lib/types';

describe('Codex steering', () => {
  it('sends new steering input to an active turn', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-steering-'));
    const steerLog = path.join(tempDir, 'steer.jsonl');
    const fakeServer = path.join(tempDir, 'fake-app-server.mjs');
    await writeFile(fakeServer, fakeAppServerSource(steerLog), 'utf8');

    let delivered = false;
    let markedDelivered = false;
    const events: CodexRuntimeEvent[] = [];
    await runCodexSession({
      config: {
        command: `${process.execPath} ${JSON.stringify(fakeServer)}`,
        model: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        approvalPolicy: null,
        threadSandbox: null,
        turnSandboxPolicy: null,
        turnTimeoutMs: 5000,
        readTimeoutMs: 1000,
        stallTimeoutMs: 5000,
      },
      workspacePath: tempDir,
      issue: testIssue,
      promptTemplate: 'Task: {{ issue.title }}',
      attempt: null,
      maxTurns: 1,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
      refreshIssue: async () => testIssue,
      shouldContinue: () => false,
      steeringPollMs: 25,
      loadSteering: async () => {
        if (delivered) return null;
        delivered = true;
        return {
          input: [{ type: 'text', text: 'Please use the new steering context.', text_elements: [] }],
          description: 'test steering',
          markDelivered: () => {
            markedDelivered = true;
          },
        };
      },
    });

    const messages = (await readFile(steerLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const threadStart = messages.find((message) => message.method === 'thread/start');
    const turnStart = messages.find((message) => message.method === 'turn/start');
    const steered = messages.filter((message) => message.method === 'turn/steer');
    expect(threadStart.params.model).toBe('gpt-5.6-sol');
    expect(threadStart.params).toMatchObject({ ephemeral: false, serviceName: 'agent-kanban-task' });
    expect(turnStart.params).toMatchObject({ model: 'gpt-5.6-sol', effort: 'xhigh' });
    expect(markedDelivered).toBe(true);
    expect(steered).toHaveLength(1);
    expect(steered[0].method).toBe('turn/steer');
    expect(steered[0].params.expectedTurnId).toBe('turn-1');
    expect(steered[0].params.input[0].text).toContain('new steering context');
    expect(events.some((event) => event.event === 'turn_steered')).toBe(true);
  });

  it('resumes the native thread and returns a terminal external wait request', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-wait-resume-'));
    const requestLog = path.join(tempDir, 'requests.jsonl');
    const fakeServer = path.join(tempDir, 'fake-app-server.mjs');
    await writeFile(fakeServer, fakeWaitServerSource(requestLog), 'utf8');
    let sessionId: string | null = null;

    const result = await runCodexSession({
      config: {
        command: `${process.execPath} ${JSON.stringify(fakeServer)}`,
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        approvalPolicy: null,
        threadSandbox: null,
        turnSandboxPolicy: null,
        turnTimeoutMs: 5000,
        readTimeoutMs: 1000,
        stallTimeoutMs: 5000,
      },
      workspacePath: tempDir,
      issue: testIssue,
      promptTemplate: 'Task: {{ issue.title }}',
      attempt: null,
      maxTurns: 1,
      signal: new AbortController().signal,
      onEvent: () => {},
      refreshIssue: async () => testIssue,
      shouldContinue: () => false,
      nativeSessionId: 'thread-existing',
      onSession: (value) => { sessionId = value; },
    });

    const messages = (await readFile(requestLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(messages.find((message) => message.method === 'thread/start')).toBeUndefined();
    expect(messages.find((message) => message.method === 'thread/resume')?.params)
      .toMatchObject({ threadId: 'thread-existing', excludeTurns: true });
    expect(sessionId).toBe('thread-existing');
    expect(result).toEqual({
      nativeSessionId: 'thread-existing',
      waitRequest: {
        kind: 'ci',
        reason: 'Checks are still pending',
        resumeAfterSeconds: 120,
      },
    });
  });
});

const testIssue: Issue = {
  id: 'issue-1',
  identifier: 'TEST-1',
  title: 'Test task',
  description: null,
  priority: null,
  state: 'In Progress',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null,
};

function fakeAppServerSource(steerLog: string) {
  return `
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const steerLog = ${JSON.stringify(steerLog)};
const rl = createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (!message.id) return;
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'fake-codex' } });
    return;
  }
  if (message.method === 'thread/start') {
    appendFileSync(steerLog, JSON.stringify({ method: message.method, params: message.params }) + '\\n');
    send({ id: message.id, result: { thread: { id: 'thread-1' } } });
    return;
  }
  if (message.method === 'turn/start') {
    appendFileSync(steerLog, JSON.stringify({ method: message.method, params: message.params }) + '\\n');
    send({ id: message.id, result: { turn: { id: 'turn-1' } } });
    setTimeout(() => {
      send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: { type: 'completed' } } } });
    }, 250);
    return;
  }
  if (message.method === 'turn/steer') {
    appendFileSync(steerLog, JSON.stringify({ method: message.method, params: message.params }) + '\\n');
    send({ id: message.id, result: { turnId: message.params.expectedTurnId } });
    return;
  }
  send({ id: message.id, result: {} });
});
`;
}

function fakeWaitServerSource(requestLog: string) {
  return `
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const requestLog = ${JSON.stringify(requestLog)};
const rl = createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (!message.id) return;
  appendFileSync(requestLog, JSON.stringify({ method: message.method, params: message.params }) + '\\n');
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'fake-codex' } });
    return;
  }
  if (message.method === 'thread/resume') {
    send({ id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === 'turn/start') {
    send({ id: message.id, result: { turn: { id: 'turn-wait' } } });
    setTimeout(() => {
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-existing',
          turnId: 'turn-wait',
          delta: '<agent-kanban-wait>{"kind":"ci","reason":"Checks are still pending","resumeAfterSeconds":120}</agent-kanban-wait>',
        },
      });
      send({ method: 'turn/completed', params: { threadId: 'thread-existing', turn: { id: 'turn-wait', status: { type: 'completed' } } } });
    }, 25);
    return;
  }
  send({ id: message.id, result: {} });
});
`;
}
