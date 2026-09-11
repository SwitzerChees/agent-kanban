import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-wiki-todos-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'wiki-todos-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'wiki-todos-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let wikiTodos: typeof import('../server/lib/wiki-todos');
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  wikiTodos = await import('../server/lib/wiki-todos');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  member = insertUser('wiki-todos-member', 'Wiki TODO Member');
  outsider = insertUser('wiki-todos-outsider', 'Wiki TODO Outsider');
  const project = await kanban.createProject({
    name: 'Wiki TODO Project',
    key: 'WTODO',
    folderPath: path.join(testRoot, 'project'),
    userIds: [member.id],
  }, admin);
  projectId = project.id;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('reusable wiki TODO lists', () => {
  test('shares one ordered list across project members and records completion dates', () => {
    const list = wikiTodos.createWikiTodoList(projectId, { name: '  Release   checklist  ' }, admin);
    expect(list).toMatchObject({ name: 'Release checklist', items: [] });

    const first = wikiTodos.addWikiTodoItem(list.id, { text: 'Prepare release notes' }, member);
    const second = wikiTodos.addWikiTodoItem(list.id, { text: 'Publish build' }, admin);
    expect(second.position).toBeGreaterThan(first.position);

    const completed = wikiTodos.updateWikiTodoItem(first.id, {
      completed: true,
      expectedUpdatedAt: first.updatedAt,
    }, member);
    expect(completed).toMatchObject({ completed: true });
    expect(completed.completedAt).toEqual(expect.any(String));

    const memberView = wikiTodos.listWikiTodoLists(projectId, member);
    expect(memberView[0]?.items).toEqual([
      expect.objectContaining({ id: first.id, completed: true }),
      expect.objectContaining({ id: second.id, completed: false }),
    ]);

    const reopened = wikiTodos.updateWikiTodoItem(first.id, { completed: false }, admin);
    expect(reopened).toMatchObject({ completed: false, completedAt: null });
  });

  test('atomically reorders items and rejects stale or unauthorized moves', () => {
    const list = wikiTodos.createWikiTodoList(projectId, { name: 'Ordered actions' }, admin);
    const first = wikiTodos.addWikiTodoItem(list.id, { text: 'First action' }, admin);
    const second = wikiTodos.addWikiTodoItem(list.id, { text: 'Second action' }, admin);
    const third = wikiTodos.addWikiTodoItem(list.id, { text: 'Third action' }, admin);

    const moved = wikiTodos.moveWikiTodoItem(third.id, {
      position: 0,
      expectedUpdatedAt: third.updatedAt,
    }, member);
    expect(moved.item).toMatchObject({ id: third.id, position: 0, updatedBy: member.id });
    expect(moved.item.updatedAt).not.toBe(third.updatedAt);
    expect(moved.items.map((item) => item.id)).toEqual([third.id, first.id, second.id]);
    expect(moved.items.map((item) => item.position)).toEqual([0, 1000, 2000]);

    expectStatusMessage(
      () => wikiTodos.moveWikiTodoItem(third.id, { position: 2, expectedUpdatedAt: third.updatedAt }, admin),
      'wiki_todo_item_stale',
    );
    expectStatusMessage(
      () => wikiTodos.moveWikiTodoItem(first.id, { position: 2, expectedUpdatedAt: first.updatedAt }, outsider),
      'project_forbidden',
    );

    const actions = dbModule.db.select().from(dbModule.schema.activity)
      .where(eq(dbModule.schema.activity.projectId, projectId)).all()
      .map((entry) => entry.action);
    expect(actions).toContain('wiki_todo_item_moved');
  });

  test('stores person and task references in TODO items with stable IDs', async () => {
    const task = await kanban.createTask(projectId, { title: 'Review TODO references' }, admin);
    const list = wikiTodos.createWikiTodoList(projectId, { name: 'Referenced actions' }, admin);
    const item = wikiTodos.addWikiTodoItem(list.id, {
      text: `Ask @Wiki TODO Member to review #${task.key}`,
    }, member);

    expect(item.text).toContain(`[@ id="${member.id}" label="Wiki TODO Member"]`);
    expect(item.text).toContain(`[@ id="${task.id}" label="${task.key} · Review TODO references" char="#"]`);
    expect(item.text).not.toContain('@Wiki TODO Member');
    expect(item.text).not.toContain(`#${task.key}`);
  });

  test('preserves multiline item text and canonicalizes references on create and edit', async () => {
    const task = await kanban.createTask(projectId, { title: 'Multiline TODO task' }, admin);
    const list = wikiTodos.createWikiTodoList(projectId, { name: 'Multiline actions' }, admin);
    const item = wikiTodos.addWikiTodoItem(list.id, {
      text: `First line for @Wiki TODO Member\n  Second line for #${task.key}`,
    }, member);

    expect(item.text).toBe([
      `First line for [@ id="${member.id}" label="Wiki TODO Member"]`,
      `Second line for [@ id="${task.id}" label="${task.key} · Multiline TODO task" char="#"]`,
    ].join('\n'));

    const updated = wikiTodos.updateWikiTodoItem(item.id, {
      text: `Updated @Wiki TODO Member\n\nFollow up on #${task.key}`,
      expectedUpdatedAt: item.updatedAt,
    }, admin);
    expect(updated.text).toContain('\n\n');
    expect(updated.text).toContain(`id="${member.id}"`);
    expect(updated.text).toContain(`id="${task.id}"`);
  });

  test('enforces case-insensitive project-local names, access, and optimistic updates', () => {
    expectStatusMessage(
      () => wikiTodos.createWikiTodoList(projectId, { name: 'release CHECKLIST' }, member),
      'wiki_todo_list_name_exists',
    );
    expectStatusMessage(() => wikiTodos.listWikiTodoLists(projectId, outsider), 'project_forbidden');

    const list = wikiTodos.listWikiTodoLists(projectId, admin)[0]!;
    const item = list.items[0]!;
    expectStatusMessage(
      () => wikiTodos.updateWikiTodoItem(item.id, { text: 'Stale edit', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }, member),
      'wiki_todo_item_stale',
    );
    expectStatusMessage(() => wikiTodos.addWikiTodoItem(list.id, { text: 'Forbidden' }, outsider), 'project_forbidden');

    const actions = dbModule.db.select().from(dbModule.schema.activity)
      .where(eq(dbModule.schema.activity.projectId, projectId)).all()
      .map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining([
      'wiki_todo_list_created',
      'wiki_todo_item_created',
      'wiki_todo_item_updated',
    ]));
  });

  test('deletes one item for every shared list reference with authorization and stale-write protection', () => {
    const list = wikiTodos.createWikiTodoList(projectId, { name: 'Disposable actions' }, admin);
    const item = wikiTodos.addWikiTodoItem(list.id, { text: 'Remove this item' }, member);

    expectStatusMessage(
      () => wikiTodos.deleteWikiTodoItem(item.id, { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }, member),
      'wiki_todo_item_stale',
    );
    expectStatusMessage(
      () => wikiTodos.deleteWikiTodoItem(item.id, { expectedUpdatedAt: item.updatedAt }, outsider),
      'project_forbidden',
    );

    expect(wikiTodos.deleteWikiTodoItem(item.id, { expectedUpdatedAt: item.updatedAt }, member))
      .toEqual({ id: item.id, listId: list.id });
    expect(wikiTodos.listWikiTodoLists(projectId, admin).find((candidate) => candidate.id === list.id)?.items).toEqual([]);
    expectStatusMessage(
      () => wikiTodos.deleteWikiTodoItem(item.id, { expectedUpdatedAt: item.updatedAt }, member),
      'wiki_todo_item_not_found',
    );

    const actions = dbModule.db.select().from(dbModule.schema.activity)
      .where(eq(dbModule.schema.activity.projectId, projectId)).all()
      .map((entry) => entry.action);
    expect(actions).toContain('wiki_todo_item_deleted');
  });
});

function insertUser(emailPrefix: string, name: string): User {
  const now = new Date().toISOString();
  const row: User = {
    id: randomUUID(),
    email: `${emailPrefix}@example.com`,
    name,
    passwordHash: admin?.passwordHash ?? 'unused',
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(row).run();
  return row;
}

function expectStatusMessage(action: () => unknown, statusMessage: string) {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ statusMessage });
    return;
  }
  throw new Error(`Expected ${statusMessage}`);
}

describe('live TODO collaboration', () => {
  test('publishes committed changes to the owning project only and unsubscribes cleanly', async () => {
    const events = await import('../server/lib/wiki-todo-events');
    const snapshots: string[][] = [];
    let unrelated = 0;
    const unsubscribe = events.subscribeWikiTodoChanges(projectId, () => {
      snapshots.push(wikiTodos.listWikiTodoLists(projectId, member).flatMap((list) => list.items.map((item) => item.text)));
    });
    const unsubscribeOther = events.subscribeWikiTodoChanges('another-project', () => unrelated++);
    try {
      const list = wikiTodos.createWikiTodoList(projectId, { name: 'Live changes' }, admin);
      const item = wikiTodos.addWikiTodoItem(list.id, { text: 'Live created' }, member);
      const edited = wikiTodos.updateWikiTodoItem(item.id, { text: 'Live edited', expectedUpdatedAt: item.updatedAt }, admin);
      const moved = wikiTodos.moveWikiTodoItem(item.id, { position: 0, expectedUpdatedAt: edited.updatedAt }, member);
      wikiTodos.deleteWikiTodoItem(item.id, { expectedUpdatedAt: moved.item.updatedAt }, admin);
      expect(snapshots).toHaveLength(5);
      expect(snapshots[1]).toContain('Live created');
      expect(snapshots[2]).toContain('Live edited');
      expect(snapshots[4]).not.toContain('Live edited');
      expect(unrelated).toBe(0);
      expectStatusMessage(() => wikiTodos.addWikiTodoItem(list.id, { text: 'Forbidden' }, outsider), 'project_forbidden');
      expect(snapshots).toHaveLength(5);
      unsubscribe();
      wikiTodos.addWikiTodoItem(list.id, { text: 'After unsubscribe' }, admin);
      expect(snapshots).toHaveLength(5);
    } finally {
      unsubscribe();
      unsubscribeOther();
    }
  });

  test('allows separate item edits but rejects simultaneous stale writes even within one millisecond', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T10:00:00Z'));
    try {
      const list = wikiTodos.createWikiTodoList(projectId, { name: 'Concurrent edits' }, admin);
      const first = wikiTodos.addWikiTodoItem(list.id, { text: 'First' }, admin);
      const second = wikiTodos.addWikiTodoItem(list.id, { text: 'Second' }, member);
      const updated = wikiTodos.updateWikiTodoItem(first.id, { text: 'First edited', expectedUpdatedAt: first.updatedAt }, admin);
      expect(updated.updatedAt).not.toBe(first.updatedAt);
      expect(wikiTodos.updateWikiTodoItem(second.id, { text: 'Second edited', expectedUpdatedAt: second.updatedAt }, member).text).toBe('Second edited');
      expectStatusMessage(() => wikiTodos.updateWikiTodoItem(first.id, { text: 'Stale overwrite', expectedUpdatedAt: first.updatedAt }, member), 'wiki_todo_item_stale');
      expectStatusMessage(() => wikiTodos.deleteWikiTodoItem(first.id, { expectedUpdatedAt: first.updatedAt }, member), 'wiki_todo_item_stale');
    } finally {
      vi.useRealTimers();
    }
  });

  test('keeps the original completion day on repeated completion and text edits, resetting it on reopen', () => {
    const list = wikiTodos.createWikiTodoList(projectId, { name: 'Completion history' }, admin);
    const item = wikiTodos.addWikiTodoItem(list.id, { text: 'Previously done' }, admin);
    const yesterday = '2026-09-10T10:00:00.000Z';
    dbModule.db.update(dbModule.schema.wikiTodoItems).set({ completed: true, completedAt: yesterday }).where(eq(dbModule.schema.wikiTodoItems.id, item.id)).run();
    expect(wikiTodos.updateWikiTodoItem(item.id, { completed: true }, member).completedAt).toBe(yesterday);
    expect(wikiTodos.updateWikiTodoItem(item.id, { text: 'Edited after completion' }, member).completedAt).toBe(yesterday);
    expect(wikiTodos.updateWikiTodoItem(item.id, { completed: false }, member).completedAt).toBeNull();
    expect(wikiTodos.updateWikiTodoItem(item.id, { completed: true }, member).completedAt).not.toBe(yesterday);
  });
});
