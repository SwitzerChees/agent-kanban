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
    expect(turnStart.params).toMatchObject({ model: 'gpt-5.6-sol', effort: 'xhigh' });
    expect(markedDelivered).toBe(true);
    expect(steered).toHaveLength(1);
    expect(steered[0].method).toBe('turn/steer');
    expect(steered[0].params.expectedTurnId).toBe('turn-1');
    expect(steered[0].params.input[0].text).toContain('new steering context');
    expect(events.some((event) => event.event === 'turn_steered')).toBe(true);
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
