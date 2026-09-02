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
