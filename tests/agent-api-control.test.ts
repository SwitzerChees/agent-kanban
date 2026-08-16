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
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('external agent task controls', () => {
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
    }, admin);

    expect(task).toMatchObject({ columnId: todo.id, agentEnabled: true, agentStatus: 'queued' });

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

  test('keeps project authorization identical to the browser user', async () => {
    const project = await kanban.createProject({
      name: 'Private Harness Project',
      key: 'PRIVATE',
      folderPath: path.join(testRoot, 'private-workspace'),
    }, admin);
    const task = await kanban.createTask(project.id, { title: 'Private task' }, admin);
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
