import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { MAX_AGENT_CAPACITY_RETRIES } from '../server/lib/agent-retry';

const root = mkdtempSync(path.join(tmpdir(), 'kanban-capacity-recovery-'));
process.env.KANBAN_DATA_DIR = root;
process.env.KANBAN_ADMIN_EMAIL = 'capacity-test@example.invalid';
process.env.KANBAN_ADMIN_PASSWORD = 'disposable-test-password';
let database: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let dispatcher: typeof import('../server/lib/local-dispatcher');
const outage = new Error('turn_failed: {"error":{"message":"exceeded retry limit, last status: 429 Too Many Requests"}}');

beforeAll(async () => {
  database = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  dispatcher = await import('../server/lib/local-dispatcher');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function runningTask(key: string) {
  const { db, schema } = database;
  const admin = db.select().from(schema.users).get()!;
  const project = await kanban.createProject({ name: key, key, folderPath: path.join(root, key) }, admin);
  const task = await kanban.createTask(project.id, { title: 'Resume after provider failure', agentEnabled: true }, admin);
  const column = kanban.getBoard(project.id, admin).columns.find(column => column.key === 'in_progress')!;
  db.update(schema.tasks).set({ agentStatus: 'running', columnId: column.id }).where(eq(schema.tasks.id, task.id)).run();
  const now = new Date().toISOString();
  const runId = `${key}-run`;
  db.insert(schema.taskAgentRuns).values({
    id: runId, taskId: task.id, harness: 'codex', status: 'running', nativeSessionId: `${key}-session`,
    waitTarget: '{"kind":"deployment"}', waitResult: '{"status":"success"}', waitCount: 12,
    createdAt: now, startedAt: now, updatedAt: now,
  }).run();
  return { admin, task, runId, column };
}

test('parks 429 failures, preserves progress, frees slots and resumes the same run after restart', async () => {
  const { db, schema } = database;
  const { task, runId, column } = await runningTask('RECOVER');
  const deferred = dispatcher.deferTaskForCapacityRetry(task.id, runId, outage)!;
  expect(Date.parse(deferred.resumeAt) - Date.now()).toBeGreaterThan(59_000);
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get())
    .toMatchObject({ agentStatus: 'waiting_external', columnId: column.id });
  expect(db.select().from(schema.taskAgentRuns).where(eq(schema.taskAgentRuns.id, runId)).get()).toMatchObject({
    status: 'waiting_external', nativeSessionId: 'RECOVER-session', waitKind: 'rate_limit',
    waitTarget: null, waitResult: '{"status":"success"}', waitCount: 13, capacityRetryCount: 1, completedAt: null,
  });
  expect(dispatcher.taskSlotAvailability(task.projectId, 'codex').projectRunning).toBe(0);
  expect(dispatcher.taskCapacityAvailability('codex', 'gpt-6.1-sol').available).toBe(false);
  expect(dispatcher.taskCapacityAvailability('codex', 'gpt-6-astra').available).toBe(true);
  expect(dispatcher.taskCapacityAvailability('prime-agent', 'gpt-6.1-sol').available).toBe(true);

  const probe = vi.fn().mockResolvedValue({ status: 'success' });
  const restarted = new dispatcher.LocalTaskDispatcher(probe);
  await restarted.wakeDueExternalWaits();
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('waiting_external');
  expect(probe).not.toHaveBeenCalled();

  db.update(schema.taskAgentRuns).set({ resumeAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(schema.taskAgentRuns.id, runId)).run();
  await restarted.wakeDueExternalWaits();
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('queued');
  expect(db.select().from(schema.taskAgentRuns).where(eq(schema.taskAgentRuns.id, runId)).get())
    .toMatchObject({ nativeSessionId: 'RECOVER-session', capacityRetryCount: 1, waitResult: '{"status":"success"}' });
  expect(dispatcher.taskCapacityAvailability('codex', 'gpt-6.1-sol').available).toBe(true);

  // The first recovery probe blocks other tasks, including those in another project.
  db.update(schema.tasks).set({ agentStatus: 'running' }).where(eq(schema.tasks.id, task.id)).run();
  db.update(schema.taskAgentRuns).set({ status: 'running', resumeAt: null }).where(eq(schema.taskAgentRuns.id, runId)).run();
  expect(dispatcher.taskCapacityAvailability('codex', 'gpt-6.1-sol').available).toBe(false);
  const again = dispatcher.deferTaskForCapacityRetry(task.id, runId, outage)!;
  expect(again.attempt).toBe(2);
  expect(Date.parse(again.resumeAt) - Date.now()).toBeGreaterThan(119_000);
  kanban.cancelTaskAgent(task.id, db.select().from(schema.users).get()!);
  expect(dispatcher.taskCapacityAvailability('codex', 'gpt-6.1-sol').available).toBe(true);
});

test('does not resurrect cancelled tasks or mask quality failures and stops after the retry budget', async () => {
  const { db, schema } = database;
  const { task, runId, admin } = await runningTask('LIMIT');
  expect(dispatcher.deferTaskForCapacityRetry(task.id, runId, new Error('completion_gate_failed: missing screenshots'))).toBeNull();
  db.update(schema.taskAgentRuns).set({ capacityRetryCount: MAX_AGENT_CAPACITY_RETRIES })
    .where(eq(schema.taskAgentRuns.id, runId)).run();
  expect(dispatcher.deferTaskForCapacityRetry(task.id, runId, outage)).toBeNull();
  db.update(schema.taskAgentRuns).set({ capacityRetryCount: 0 }).where(eq(schema.taskAgentRuns.id, runId)).run();
  kanban.cancelTaskAgent(task.id, admin);
  expect(dispatcher.deferTaskForCapacityRetry(task.id, runId, outage)).toBeNull();
  await new dispatcher.LocalTaskDispatcher().wakeDueExternalWaits();
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get())
    .toMatchObject({ agentStatus: 'idle', agentEnabled: false });
});

test('the dispatcher defers without an inline retry or deleting the session, then completes the same run', async () => {
  const { db, schema } = database;
  const { task, runId, column } = await runningTask('DISPATCH');
  const codex = await import('../server/lib/codex');
  const workspaces = await import('../server/lib/git-workspaces');
  const sandbox = await import('../server/lib/task-harness-sandbox');
  const cleanup = vi.spyOn(sandbox, 'cleanupTaskHarnessSession').mockResolvedValue();
  vi.spyOn(sandbox, 'closeTaskBrowserSession').mockResolvedValue();
  vi.spyOn(workspaces, 'prepareTaskWorktree').mockResolvedValue({
    projectPath: root, worktreeRoot: root, gitRoot: root, branchName: 'codex/recovery',
    revision: 'a'.repeat(40), createdNow: false, recoveryRef: null,
  });
  const sessionRoot = path.join(root, 'task-sessions', task.projectId, task.id, runId);
  mkdirSync(sessionRoot, { recursive: true });
  const marker = path.join(sessionRoot, 'session-progress');
  writeFileSync(marker, 'saved session');
  const harness = vi.spyOn(codex, 'runCodexSession').mockImplementationOnce(async options => {
    options.onSession?.('preserved-session');
    throw outage;
  }).mockResolvedValueOnce({ nativeSessionId: 'preserved-session', waitRequest: null });
  try {
    const runner = new dispatcher.LocalTaskDispatcher();
    db.update(schema.tasks).set({ agentStatus: 'queued' }).where(eq(schema.tasks.id, task.id)).run();
    await runner['runTask'](task, column);
    expect(harness).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    expect(existsSync(marker)).toBe(true);
    expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('waiting_external');

    db.update(schema.taskAgentRuns).set({ resumeAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(schema.taskAgentRuns.id, runId)).run();
    const restarted = new dispatcher.LocalTaskDispatcher();
    await restarted.wakeDueExternalWaits();
    const queued = db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()!;
    await restarted['runTask'](queued, column);
    expect(harness).toHaveBeenCalledTimes(2);
    expect(harness.mock.calls[1]![0].nativeSessionId).toBe('preserved-session');
    expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('done');
    expect(db.select().from(schema.taskAgentRuns).where(eq(schema.taskAgentRuns.id, runId)).get())
      .toMatchObject({ status: 'completed', capacityRetryCount: 0 });
    expect(db.select().from(schema.taskAgentRuns).where(eq(schema.taskAgentRuns.taskId, task.id)).all()).toHaveLength(1);
    expect(cleanup).toHaveBeenCalledWith(sessionRoot);
  } finally {
    vi.restoreAllMocks();
  }
});
