import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-hierarchy-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'hierarchy-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'hierarchy-test-password';

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

describe('project topic hierarchy', () => {
  test('creates a default hierarchy and keeps tasks inside their selected sub-topic', async () => {
    const project = await kanban.createProject({
      name: 'Hierarchy Project',
      key: 'HIER',
      folderPath: path.join(testRoot, 'workspace-hierarchy'),
    }, admin);

    const initialBoard = kanban.getBoard(project.id, admin);
    expect(initialBoard.oberthemen).toHaveLength(1);
    expect(initialBoard.unterthemen).toHaveLength(1);
    expect(initialBoard.unterthemen[0]?.oberthemaId).toBe(initialBoard.oberthemen[0]?.id);

    const parent = kanban.createOberthema(project.id, {
      name: 'Delivery',
      description: 'Features prepared for delivery',
      color: 'indigo',
    }, admin);
    const subtopic = kanban.createUnterthema(parent.id, {
      name: 'Frontend',
      description: 'User-facing work',
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Build hierarchy navigation',
      unterthemaId: subtopic.id,
    }, admin);

    expect(task?.unterthemaId).toBe(subtopic.id);
    expect(task?.agentEnabled).toBe(false);
    const detail = kanban.getTaskDetail(task!.id, admin);
    expect(detail.hierarchy?.oberthema.id).toBe(parent.id);
    expect(detail.hierarchy?.unterthema?.id).toBe(subtopic.id);

    const directTask = await kanban.createTask(project.id, {
      title: 'Plan delivery directly in the parent topic',
      oberthemaId: parent.id,
    }, admin);
    expect(directTask).toMatchObject({ oberthemaId: parent.id, unterthemaId: null, agentEnabled: false });
    expect(kanban.getTaskDetail(directTask!.id, admin).hierarchy).toMatchObject({
      oberthema: { id: parent.id },
      unterthema: null,
    });

    const todoColumn = initialBoard.columns.find((column) => column.key === 'todo')!;
    expect(kanban.updateTask(directTask!.id, { columnId: todoColumn.id }, admin)?.agentStatus).toBe('idle');
    expect(kanban.updateTask(directTask!.id, { agentEnabled: true }, admin)).toMatchObject({ agentEnabled: true, agentStatus: 'queued' });
    expect(kanban.updateTask(directTask!.id, { agentEnabled: false }, admin)).toMatchObject({ agentEnabled: false, agentStatus: 'idle' });

    expectStatusMessage(
      () => kanban.createOberthema(project.id, { name: 'delivery' }, admin),
      'oberthema_name_exists',
    );
    expectStatusMessage(
      () => kanban.deleteUnterthema(subtopic.id, admin),
      'unterthema_not_empty',
    );

    const fallback = initialBoard.unterthemen[0]!;
    kanban.updateTask(task!.id, { unterthemaId: fallback.id }, admin);
    expect(kanban.deleteUnterthema(subtopic.id, admin)).toMatchObject({ ok: true });
  });

  test('rejects hierarchy moves and task assignments across projects', async () => {
    const firstProject = await kanban.createProject({
      name: 'First Project',
      key: 'FIRST',
      folderPath: path.join(testRoot, 'workspace-first'),
    }, admin);
    const secondProject = await kanban.createProject({
      name: 'Second Project',
      key: 'SECOND',
      folderPath: path.join(testRoot, 'workspace-second'),
    }, admin);
    const firstBoard = kanban.getBoard(firstProject.id, admin);
    const secondBoard = kanban.getBoard(secondProject.id, admin);
    const firstSubtopic = firstBoard.unterthemen[0]!;
    const secondParent = secondBoard.oberthemen[0]!;
    const secondSubtopic = secondBoard.unterthemen[0]!;

    expectStatusMessage(
      () => kanban.updateUnterthema(firstSubtopic.id, { oberthemaId: secondParent.id }, admin),
      'invalid_oberthema',
    );

    await expect(kanban.createTask(firstProject.id, {
      title: 'Invalid cross-project task',
      unterthemaId: secondSubtopic.id,
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_unterthema' });
  });

  test('defaults responsibility to the creator while allowing project members or nobody', async () => {
    const project = await kanban.createProject({
      name: 'Responsibility Project',
      key: 'RESP',
      folderPath: path.join(testRoot, 'workspace-responsibility'),
    }, admin);
    const member = insertUser('responsibility-member', 'Member');
    const outsider = insertUser('responsibility-outsider', 'Outsider');
    kanban.addProjectUser(project.id, member.id, admin);

    const defaultTask = await kanban.createTask(project.id, { title: 'Owned by creator' }, admin);
    expect(defaultTask?.assigneeId).toBe(admin.id);

    const unassignedTask = await kanban.createTask(project.id, {
      title: 'Explicitly unassigned',
      assigneeId: null,
    }, admin);
    expect(unassignedTask?.assigneeId).toBeNull();

    const aiTask = await kanban.createTask(project.id, {
      title: 'AI task with human responsibility',
      assigneeId: member.id,
      agentEnabled: true,
    }, admin);
    expect(aiTask).toMatchObject({ assigneeId: member.id, agentEnabled: true });
    expect(kanban.updateTask(aiTask!.id, { assigneeId: null }, admin)).toMatchObject({
      assigneeId: null,
      agentEnabled: true,
    });
    expect(kanban.updateTask(aiTask!.id, { assigneeId: member.id }, admin)?.assigneeId).toBe(member.id);
    await kanban.updateProject(project.id, { userIds: [] }, admin);
    expect(kanban.getBoard(project.id, admin).tasks.find((task) => task.id === aiTask?.id)?.assigneeId).toBeNull();

    await expect(kanban.createTask(project.id, {
      title: 'Invalid responsibility',
      assigneeId: outsider.id,
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_assignee' });
  });

  test('reorders parent and sub-topics atomically, including moves between parents', async () => {
    const project = await kanban.createProject({
      name: 'Reorder Project',
      key: 'ORDER',
      folderPath: path.join(testRoot, 'workspace-order'),
    }, admin);
    const initial = kanban.getBoard(project.id, admin);
    const firstParent = initial.oberthemen[0]!;
    const firstSubtopic = initial.unterthemen[0]!;
    const secondParent = kanban.createOberthema(project.id, { name: 'Second parent' }, admin);
    const secondSubtopic = kanban.createUnterthema(secondParent.id, { name: 'Second sub-topic' }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Move with its sub-topic',
      unterthemaId: firstSubtopic.id,
    }, admin);

    const reordered = kanban.reorderHierarchy(project.id, {
      oberthemaIds: [secondParent.id, firstParent.id],
      unterthemen: [
        { oberthemaId: secondParent.id, ids: [secondSubtopic.id, firstSubtopic.id] },
        { oberthemaId: firstParent.id, ids: [] },
      ],
    }, admin);

    expect(reordered.oberthemen.map((topic) => topic.id)).toEqual([secondParent.id, firstParent.id]);
    expect(reordered.unterthemen.map((topic) => topic.id)).toEqual([secondSubtopic.id, firstSubtopic.id]);
    expect(reordered.tasks.find((item) => item.id === task?.id)).toMatchObject({
      oberthemaId: secondParent.id,
      unterthemaId: firstSubtopic.id,
    });

    expectStatusMessage(
      () => kanban.reorderHierarchy(project.id, {
        oberthemaIds: [secondParent.id, secondParent.id],
        unterthemen: [
          { oberthemaId: secondParent.id, ids: [secondSubtopic.id, firstSubtopic.id] },
          { oberthemaId: firstParent.id, ids: [] },
        ],
      }, admin),
      'invalid_hierarchy_order',
    );
  });
});

function expectStatusMessage(action: () => unknown, expected: string) {
  try {
    action();
    throw new Error(`Expected ${expected}`);
  } catch (error) {
    expect(error).toMatchObject({ statusMessage: expected });
  }
}

function insertUser(id: string, name: string): User {
  const now = new Date().toISOString();
  const user: User = {
    id,
    email: `${id}@example.com`,
    name,
    passwordHash: 'test-password-hash',
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(user).run();
  return user;
}
