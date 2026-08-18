import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-api-control-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'agent-control-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'agent-control-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let localDispatcher: typeof import('../server/lib/local-dispatcher');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  localDispatcher = await import('../server/lib/local-dispatcher');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('external agent task controls', () => {
  test('retries failed agent runs at most twice and stops after success', async () => {
    const attempts: number[] = [];
    const retries: number[] = [];
    const result = await localDispatcher.runWithAgentRetries({
      retries: 2,
      signal: new AbortController().signal,
      retryDelayMs: 0,
      run: async (attempt) => {
        attempts.push(attempt);
        if (attempt < 2) throw new Error('temporary_failure');
        return 'done';
      },
      onRetry: (retry) => { retries.push(retry); },
    });
    expect(result).toBe('done');
    expect(attempts).toEqual([0, 1, 2]);
    expect(retries).toEqual([1, 2]);

    const cappedAttempts: number[] = [];
    await expect(localDispatcher.runWithAgentRetries({
      retries: 99,
      signal: new AbortController().signal,
      retryDelayMs: 0,
      run: async (attempt) => {
        cappedAttempts.push(attempt);
        throw new Error('permanent_failure');
      },
    })).rejects.toThrow('permanent_failure');
    expect(cappedAttempts).toEqual([0, 1, 2]);
  });

  test('persists project and harness concurrency limits and combines both slot checks', async () => {
    const project = await kanban.createProject({
      name: 'Concurrency Project',
      key: 'SLOTS',
      folderPath: path.join(testRoot, 'concurrency-workspace'),
      agentConcurrencyLimit: 3,
      agentHarnessLimits: { codex: 2, opencode: 1, 'prime-agent': 0 },
    }, admin);
    const board = kanban.getBoard(project.id, admin);
    expect(board.project).toMatchObject({
      agentConcurrencyLimit: 3,
      agentHarnessLimits: { codex: 2, opencode: 1, 'prime-agent': 0 },
    });

    const tasks = await Promise.all([
      kanban.createTask(project.id, { title: 'Codex one', agentHarness: 'codex' }, admin),
      kanban.createTask(project.id, { title: 'Codex two', agentHarness: 'codex' }, admin),
      kanban.createTask(project.id, { title: 'OpenCode one', agentHarness: 'opencode' }, admin),
    ]);
    expect(localDispatcher.taskSlotAvailability(project.id, 'prime-agent').available).toBe(false);

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'running' })
      .where(eq(dbModule.schema.tasks.id, tasks[0]!.id)).run();
    expect(localDispatcher.taskSlotAvailability(project.id, 'codex')).toMatchObject({
      available: true,
      projectRunning: 1,
      harnessRunning: 1,
    });

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'running' })
      .where(eq(dbModule.schema.tasks.id, tasks[1]!.id)).run();
    expect(localDispatcher.taskSlotAvailability(project.id, 'codex').available).toBe(false);
    expect(localDispatcher.taskSlotAvailability(project.id, 'opencode').available).toBe(true);

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'running' })
      .where(eq(dbModule.schema.tasks.id, tasks[2]!.id)).run();
    expect(localDispatcher.taskSlotAvailability(project.id, 'opencode')).toMatchObject({
      available: false,
      projectRunning: 3,
      projectLimit: 3,
    });

    await kanban.updateProject(project.id, {
      agentConcurrencyLimit: 4,
      agentHarnessLimits: { codex: 2, opencode: 1, 'prime-agent': 1 },
    }, admin);
    expect(kanban.listProjects(admin).find((item) => item.id === project.id)).toMatchObject({
      agentConcurrencyLimit: 4,
      agentHarnessLimits: { codex: 2, opencode: 1, 'prime-agent': 1 },
    });
    expect(localDispatcher.taskSlotAvailability(project.id, 'prime-agent').available).toBe(true);
  });

  test('respects the requested creation column and exposes safe queue controls', async () => {
    const project = await kanban.createProject({
      name: 'Harness Project',
      key: 'HARNESS',
      folderPath: path.join(testRoot, 'workspace'),
    }, admin);
    const board = kanban.getBoard(project.id, admin);
    const todo = board.columns.find((column) => column.key === 'todo')!;
    const task = await kanban.createTask(project.id, {
      title: 'Run through the API',
      columnId: todo.id,
      agentEnabled: true,
      agentHarness: 'opencode',
      reasoningEffort: 'medium',
    }, admin);

    expect(task).toMatchObject({
      columnId: todo.id,
      agentEnabled: true,
      agentStatus: 'queued',
      agentHarness: 'opencode',
      reasoningEffort: 'medium',
    });

    await expect(kanban.updateTask(task!.id, {
      agentHarness: 'prime-agent',
      reasoningEffort: 'xhigh',
    }, admin)).resolves.toMatchObject({
      agentHarness: 'prime-agent',
      reasoningEffort: 'xhigh',
    });

    expect(kanban.cancelTaskAgent(task!.id, admin).task).toMatchObject({
      columnId: todo.id,
      agentEnabled: false,
      agentStatus: 'idle',
    });
    expect(kanban.queueTaskAgent(task!.id, admin, 'api_queue').task).toMatchObject({
      agentEnabled: true,
      agentStatus: 'queued',
    });

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'failed' })
      .where(eq(dbModule.schema.tasks.id, task!.id)).run();
    expect(kanban.queueTaskAgent(task!.id, admin, 'api_retry').task.agentStatus).toBe('queued');
  });

  test('parks external waits without consuming a slot and supports resume, steering, cancel, and Done cleanup', async () => {
    const project = await kanban.createProject({
      name: 'External Wait Project',
      key: 'WAITS',
      folderPath: path.join(testRoot, 'wait-workspace'),
      agentConcurrencyLimit: 1,
    }, admin);
    const board = kanban.getBoard(project.id, admin);
    const todo = board.columns.find((column) => column.key === 'todo')!;
    const done = board.columns.find((column) => column.done)!;
    const task = await kanban.createTask(project.id, {
      title: 'Wait for CI',
      columnId: todo.id,
      agentEnabled: true,
      agentHarness: 'codex',
    }, admin);
    const now = new Date().toISOString();
    const runId = 'wait-run-control';
    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'waiting_external' })
      .where(eq(dbModule.schema.tasks.id, task!.id)).run();
    dbModule.db.insert(dbModule.schema.taskAgentRuns).values({
      id: runId,
      taskId: task!.id,
      harness: 'codex',
      status: 'waiting_external',
      nativeSessionId: 'codex-thread-1',
      currentUnitName: null,
      browserSessionName: null,
      waitKind: 'ci',
      waitReason: 'Checks are pending',
      resumeAt: new Date(Date.now() + 300_000).toISOString(),
      waitCount: 1,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    }).run();

    expect(localDispatcher.taskSlotAvailability(project.id, 'codex')).toMatchObject({
      available: true,
      projectRunning: 0,
      harnessRunning: 0,
    });
    expect(kanban.getTaskDetail(task!.id, admin).agentRun).toMatchObject({
      id: runId,
      status: 'waiting_external',
      waitKind: 'ci',
      waitReason: 'Checks are pending',
    });

    expect(kanban.queueTaskAgent(task!.id, admin).task.agentStatus).toBe('queued');
    let persistedRun = dbModule.db.select().from(dbModule.schema.taskAgentRuns)
      .where(eq(dbModule.schema.taskAgentRuns.id, runId)).get()!;
    expect(persistedRun).toMatchObject({ status: 'waiting_external', nativeSessionId: 'codex-thread-1' });
    expect(Date.parse(persistedRun.resumeAt!)).toBeLessThanOrEqual(Date.now());

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'waiting_external' })
      .where(eq(dbModule.schema.tasks.id, task!.id)).run();
    dbModule.db.update(dbModule.schema.taskAgentRuns).set({ resumeAt: new Date(Date.now() + 300_000).toISOString() })
      .where(eq(dbModule.schema.taskAgentRuns.id, runId)).run();
    kanban.addTaskMessage(task!.id, 'Also verify the deployment.', admin);
    expect(dbModule.db.select().from(dbModule.schema.tasks)
      .where(eq(dbModule.schema.tasks.id, task!.id)).get()!.agentStatus).toBe('queued');

    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'waiting_external' })
      .where(eq(dbModule.schema.tasks.id, task!.id)).run();
    expect(kanban.cancelTaskAgent(task!.id, admin).task).toMatchObject({
      agentEnabled: false,
      agentStatus: 'idle',
    });
    persistedRun = dbModule.db.select().from(dbModule.schema.taskAgentRuns)
      .where(eq(dbModule.schema.taskAgentRuns.id, runId)).get()!;
    expect(persistedRun).toMatchObject({ status: 'cancelled', resumeAt: null, completedAt: expect.any(String) });

    const doneTask = await kanban.createTask(project.id, {
      title: 'Complete while parked',
      columnId: todo.id,
      agentEnabled: true,
    }, admin);
    const doneRunId = 'wait-run-done';
    dbModule.db.update(dbModule.schema.tasks).set({ agentStatus: 'waiting_external' })
      .where(eq(dbModule.schema.tasks.id, doneTask!.id)).run();
    dbModule.db.insert(dbModule.schema.taskAgentRuns).values({
      id: doneRunId,
      taskId: doneTask!.id,
      harness: 'codex',
      status: 'waiting_external',
      nativeSessionId: 'codex-thread-2',
      currentUnitName: null,
      browserSessionName: null,
      waitKind: 'deployment',
      waitReason: 'Rollout is pending',
      resumeAt: new Date(Date.now() + 300_000).toISOString(),
      waitCount: 1,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    }).run();
    await expect(kanban.updateTask(doneTask!.id, { columnId: done.id }, admin))
      .resolves.toMatchObject({ agentStatus: 'done', columnId: done.id });
    expect(dbModule.db.select().from(dbModule.schema.taskAgentRuns)
      .where(eq(dbModule.schema.taskAgentRuns.id, doneRunId)).get())
      .toMatchObject({ status: 'cancelled', resumeAt: null, completedAt: expect.any(String) });
  });

  test('keeps project authorization identical to the browser user', async () => {
    const project = await kanban.createProject({
      name: 'Private Harness Project',
      key: 'PRIVATE',
      folderPath: path.join(testRoot, 'private-workspace'),
    }, admin);
    const task = await kanban.createTask(project.id, { title: 'Private task' }, admin);
    expect(task).toMatchObject({ agentHarness: 'codex', reasoningEffort: 'xhigh' });
    const now = new Date().toISOString();
    const outsider: User = {
      id: 'api-outsider',
      email: 'api-outsider@example.com',
      name: 'API Outsider',
      passwordHash: 'unused',
      role: 'member',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    dbModule.db.insert(dbModule.schema.users).values(outsider).run();

    expect(() => kanban.queueTaskAgent(task!.id, outsider)).toThrowError();
    try {
      kanban.queueTaskAgent(task!.id, outsider);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, statusMessage: 'project_forbidden' });
    }
  });
});
