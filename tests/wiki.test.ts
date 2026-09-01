import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-wiki-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'wiki-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'wiki-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let wiki: typeof import('../server/lib/wiki');
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  wiki = await import('../server/lib/wiki');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  member = insertUser('wiki-member', 'Wiki Member');
  outsider = insertUser('wiki-outsider', 'Wiki Outsider');
  const project = await kanban.createProject({
    name: 'Wiki Project',
    key: 'WIKI',
    folderPath: path.join(testRoot, 'project'),
    userIds: [member.id],
  }, admin);
  projectId = project.id;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('project wiki', () => {
  test('persists markdown pages, checklists, hierarchy, and editor attribution', () => {
    const root = wiki.createWikiPage(projectId, {
      title: 'Project handbook',
      content: '## Purpose\n\nKeep the project aligned.',
    }, admin);
    const child = wiki.createWikiPage(projectId, {
      title: 'Weekly meeting',
      parentId: root.id,
      content: '## Agenda\n\n- [x] Review board\n- [ ] Capture decisions',
    }, member);

    expect(wiki.listWikiPages(projectId, member)).toEqual([
      expect.objectContaining({
        id: root.id,
        parentId: null,
        title: 'Project handbook',
        updatedByName: admin.name,
      }),
      expect.objectContaining({
        id: child.id,
        parentId: root.id,
        content: expect.stringContaining('- [ ] Capture decisions'),
        updatedByName: member.name,
      }),
    ]);

    const updated = wiki.updateWikiPage(child.id, {
      title: 'Weekly product meeting',
      content: `${child.content}\n\n## Decisions\n\nKeep wiki pages project-local.`,
    }, admin);
    expect(updated).toMatchObject({
      title: 'Weekly product meeting',
      updatedBy: admin.id,
      updatedByName: admin.name,
    });
    expect(updated.content).toContain('## Decisions');
  });

  test('rejects cross-project parents and cyclic trees', async () => {
    const otherProject = await kanban.createProject({
      name: 'Other Wiki Project',
      key: 'WIKI2',
      folderPath: path.join(testRoot, 'other-project'),
    }, admin);
    const foreignParent = wiki.createWikiPage(otherProject.id, { title: 'Foreign parent' }, admin);
    expectStatusMessage(
      () => wiki.createWikiPage(projectId, { title: 'Invalid child', parentId: foreignParent.id }, admin),
      'invalid_wiki_parent',
    );

    const root = wiki.listWikiPages(projectId, admin).find((page) => page.parentId === null)!;
    const child = wiki.listWikiPages(projectId, admin).find((page) => page.parentId === root.id)!;
    expectStatusMessage(
      () => wiki.updateWikiPage(root.id, { parentId: child.id }, admin),
      'wiki_page_cycle',
    );
    expectStatusMessage(
      () => wiki.updateWikiPage(root.id, { parentId: root.id }, admin),
      'wiki_page_cycle',
    );
  });

  test('atomically reorders pages, reparents complete subtrees, and rejects stale moves', () => {
    const firstRoot = wiki.createWikiPage(projectId, { title: 'Architecture' }, admin);
    const secondRoot = wiki.createWikiPage(projectId, { title: 'Operations' }, admin);
    const child = wiki.createWikiPage(projectId, { title: 'Deployments', parentId: firstRoot.id }, admin);

    const nested = wiki.moveWikiPage(secondRoot.id, {
      parentId: firstRoot.id,
      position: 0,
      expectedUpdatedAt: secondRoot.updatedAt,
    }, member);
    expect(nested.page).toMatchObject({ parentId: firstRoot.id, position: 0, updatedBy: member.id });
    expect(nested.pages.filter((page) => page.parentId === firstRoot.id).map((page) => page.id))
      .toEqual([secondRoot.id, child.id]);
    expectStatusMessage(
      () => wiki.moveWikiPage(secondRoot.id, {
        parentId: null,
        position: 0,
        expectedUpdatedAt: secondRoot.updatedAt,
      }, admin),
      'wiki_page_stale',
    );

    const promoted = wiki.moveWikiPage(child.id, {
      parentId: null,
      position: 0,
      expectedUpdatedAt: child.updatedAt,
    }, admin);
    expect(promoted.page).toMatchObject({ parentId: null, position: 0 });
    expect(promoted.pages.filter((page) => page.parentId === null)[0]?.id).toBe(child.id);

    expect(wiki.deleteWikiPage(secondRoot.id, admin)).toEqual({ ok: true });
    expect(wiki.deleteWikiPage(firstRoot.id, admin)).toEqual({ ok: true });
    expect(wiki.deleteWikiPage(child.id, admin)).toEqual({ ok: true });
  });

  test('enforces project access, protects non-empty trees, and records activity', () => {
    expectStatusMessage(() => wiki.listWikiPages(projectId, outsider), 'project_forbidden');
    const root = wiki.listWikiPages(projectId, member).find((page) => page.parentId === null)!;
    const child = wiki.listWikiPages(projectId, member).find((page) => page.parentId === root.id)!;

    expectStatusMessage(() => wiki.deleteWikiPage(root.id, member), 'wiki_page_not_empty');
    expect(wiki.deleteWikiPage(child.id, member)).toEqual({ ok: true });
    expect(wiki.deleteWikiPage(root.id, admin)).toEqual({ ok: true });
    expect(wiki.listWikiPages(projectId, admin)).toEqual([]);

    const actions = dbModule.db.select().from(dbModule.schema.activity)
      .where(eq(dbModule.schema.activity.projectId, projectId)).all()
      .map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining([
      'wiki_page_created',
      'wiki_page_updated',
      'wiki_page_deleted',
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
