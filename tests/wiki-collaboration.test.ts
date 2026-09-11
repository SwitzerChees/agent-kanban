import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Y from 'yjs';
import type { User } from '../server/lib/db/schema';
import { WIKI_COLLABORATION_FIELD, WIKI_COLLABORATION_META, serializeWikiCollaborationDocument } from '../utils/wiki-collaboration-document';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-wiki-collaboration-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'wiki-collaboration-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'wiki-collaboration-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let wiki: typeof import('../server/lib/wiki');
let collaboration: typeof import('../server/lib/wiki-collaboration');
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  wiki = await import('../server/lib/wiki');
  collaboration = await import('../server/lib/wiki-collaboration');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  member = insertUser('collaboration-member', 'Collaboration Member');
  outsider = insertUser('collaboration-outsider', 'Collaboration Outsider');
  const project = await kanban.createProject({
    name: 'Collaborative Wiki',
    key: 'COLLAB',
    folderPath: path.join(testRoot, 'project'),
    userIds: [member.id],
  }, admin);
  projectId = project.id;
});

afterAll(() => {
  collaboration.stopWikiCollaboration();
  rmSync(testRoot, { recursive: true, force: true });
});

describe('collaborative wiki documents', () => {
  test('merges concurrent updates, broadcasts them, and restores the persisted Yjs state', () => {
    const page = wiki.createWikiPage(projectId, {
      title: 'Shared runbook',
      content: '## Deploy\n\nRun the checks.',
    }, admin);
    const first = collaboration.createWikiCollaborationSession(page.id, 'first-client', admin);
    const second = collaboration.createWikiCollaborationSession(page.id, 'second-client', member);
    expect(second.generation).toBe(first.generation);

    const events: Array<{ event: string; payload: any }> = [];
    const unsubscribe = collaboration.subscribeWikiCollaboration(page.id, second.sessionId, member, {
      send: (event, payload) => events.push({ event, payload }),
      close: () => {},
    });

    const firstDocument = decodeDocument(first.state);
    const firstVector = Y.encodeStateVector(firstDocument);
    firstDocument.getMap<string>(WIKI_COLLABORATION_META).set('title', 'Shared release runbook');
    collaboration.applyWikiCollaborationUpdate(
      page.id,
      first.sessionId,
      encodeUpdate(Y.encodeStateAsUpdate(firstDocument, firstVector)),
      admin,
    );

    const secondDocument = decodeDocument(second.state);
    const secondVector = Y.encodeStateVector(secondDocument);
    const paragraph = secondDocument.getXmlFragment(WIKI_COLLABORATION_FIELD).get(1) as Y.XmlElement;
    const paragraphText = paragraph.get(0) as Y.XmlText;
    paragraphText.insert(paragraphText.length, ' Then deploy together.');
    collaboration.applyWikiCollaborationUpdate(
      page.id,
      second.sessionId,
      encodeUpdate(Y.encodeStateAsUpdate(secondDocument, secondVector)),
      member,
    );

    const merged = collaboration.createWikiCollaborationSession(page.id, 'merged-client', admin);
    expect(serializeWikiCollaborationDocument(decodeDocument(merged.state))).toMatchObject({
      title: 'Shared release runbook',
      content: expect.stringContaining('Run the checks. Then deploy together.'),
    });
    expect(events.filter(({ event }) => event === 'update')).toHaveLength(2);
    expect(events[0]?.event).toBe('sync');

    const stored = dbModule.db.select().from(dbModule.schema.wikiCollaborationDocuments).get()!;
    expect(stored).toMatchObject({ pageId: page.id, generation: first.generation });
    expect(Buffer.isBuffer(stored.state)).toBe(true);

    unsubscribe();
    collaboration.stopWikiCollaboration();
    const restored = collaboration.createWikiCollaborationSession(page.id, 'restored-client', admin);
    expect(restored.generation).toBe(first.generation);
    expect(serializeWikiCollaborationDocument(decodeDocument(restored.state)).content)
      .toContain('Then deploy together.');
  });

  test('grants one short-lived block lease and releases it when the holder leaves', () => {
    const page = wiki.createWikiPage(projectId, { title: 'Lease page', content: 'One block' }, admin);
    const first = collaboration.createWikiCollaborationSession(page.id, 'lease-first', admin);
    const second = collaboration.createWikiCollaborationSession(page.id, 'lease-second', member);
    const document = decodeDocument(first.state);
    const block = document.getXmlFragment(WIKI_COLLABORATION_FIELD).get(0) as Y.XmlElement;
    const blockId = String(block.getAttribute('collabId'));

    expect(collaboration.updateWikiCollaborationPresence(page.id, first.sessionId, { editing: true, blockId }, admin))
      .toMatchObject({ granted: true });
    expect(collaboration.updateWikiCollaborationPresence(page.id, second.sessionId, { editing: true, blockId }, member))
      .toMatchObject({ granted: false, lockedBy: { userId: admin.id } });

    collaboration.closeWikiCollaborationSession(page.id, first.sessionId, admin);
    expect(collaboration.updateWikiCollaborationPresence(page.id, second.sessionId, { editing: true, blockId }, member))
      .toMatchObject({ granted: true });
  });

  test('grants independent leases for table rows and assigns stable IDs to list items', () => {
    const page = wiki.createWikiPage(projectId, {
      title: 'Granular lease page',
      content: [
        '| Topic | Owner |',
        '| --- | --- |',
        '| Release | Alice |',
        '| Review | Bob |',
        '',
        '- First item',
        '- Second item',
      ].join('\n'),
    }, admin);
    const first = collaboration.createWikiCollaborationSession(page.id, 'row-first', admin);
    const second = collaboration.createWikiCollaborationSession(page.id, 'row-second', member);
    const document = decodeDocument(first.state);
    const root = document.getXmlFragment(WIKI_COLLABORATION_FIELD);
    const rows = findXmlElements(root, 'tableRow');
    const listItems = findXmlElements(root, 'listItem');
    const rowIds = rows.map((row) => String(row.getAttribute('collabId')));

    expect(rows).toHaveLength(3);
    expect(new Set(rowIds).size).toBe(rows.length);
    expect(rowIds.every(Boolean)).toBe(true);
    expect(listItems).toHaveLength(2);
    expect(listItems.every((item) => Boolean(item.getAttribute('collabId')))).toBe(true);

    expect(collaboration.updateWikiCollaborationPresence(page.id, first.sessionId, {
      editing: true,
      blockId: rowIds[1],
    }, admin)).toMatchObject({ granted: true });
    expect(collaboration.updateWikiCollaborationPresence(page.id, second.sessionId, {
      editing: true,
      blockId: rowIds[2],
    }, member)).toMatchObject({ granted: true });
    expect(collaboration.updateWikiCollaborationPresence(page.id, second.sessionId, {
      editing: true,
      blockId: rowIds[1],
    }, member)).toMatchObject({ granted: false, lockedBy: { userId: admin.id } });
  });

  test('enforces project access and reloads active sessions after an external REST update', () => {
    const page = wiki.createWikiPage(projectId, { title: 'Externally edited', content: 'Original body' }, admin);
    expectStatusMessage(
      () => collaboration.createWikiCollaborationSession(page.id, 'outsider-client', outsider),
      'project_forbidden',
    );

    const session = collaboration.createWikiCollaborationSession(page.id, 'active-client', member);
    const events: string[] = [];
    collaboration.subscribeWikiCollaboration(page.id, session.sessionId, member, {
      send: (event) => events.push(event),
      close: () => {},
    });
    wiki.updateWikiPage(page.id, { title: 'Agent update', content: 'Replacement body' }, admin);

    expect(events).toContain('reload');
    expectStatusMessage(
      () => collaboration.updateWikiCollaborationPresence(page.id, session.sessionId, { editing: false }, member),
      'wiki_collaboration_session_expired',
    );
    const refreshed = collaboration.createWikiCollaborationSession(page.id, 'fresh-client', member);
    expect(serializeWikiCollaborationDocument(decodeDocument(refreshed.state))).toMatchObject({
      title: 'Agent update',
      content: expect.stringContaining('Replacement body'),
    });
  });
});

function decodeDocument(state: string) {
  const document = new Y.Doc();
  Y.applyUpdate(document, new Uint8Array(Buffer.from(state, 'base64')));
  return document;
}

function encodeUpdate(update: Uint8Array) {
  return Buffer.from(update).toString('base64');
}

function findXmlElements(fragment: Y.XmlFragment, nodeName: string): Y.XmlElement[] {
  const matches: Y.XmlElement[] = [];
  for (const child of fragment.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === nodeName) matches.push(child);
    matches.push(...findXmlElements(child, nodeName));
  }
  return matches;
}

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

test('delivers project TODO invalidations through existing Wiki streams across pages', async () => {
  const todos = await import('../server/lib/wiki-todos');
  const { publishWikiTodoChange } = await import('../server/lib/wiki-todo-events');
  const pageA = wiki.createWikiPage(projectId, { title: 'TODO page A', content: '' }, admin);
  const pageB = wiki.createWikiPage(projectId, { title: 'TODO page B', content: '' }, member);
  const sessionA = collaboration.createWikiCollaborationSession(pageA.id, 'todo-client-a', admin);
  const sessionB = collaboration.createWikiCollaborationSession(pageB.id, 'todo-client-b', member);
  const receivedA: string[] = [];
  const receivedB: string[] = [];
  const unsubA = collaboration.subscribeWikiCollaboration(pageA.id, sessionA.sessionId, admin, {
    send: (event) => receivedA.push(event), close: () => {},
  });
  const unsubB = collaboration.subscribeWikiCollaboration(pageB.id, sessionB.sessionId, member, {
    send: (event) => receivedB.push(event), close: () => {},
  });
  try {
    const list = todos.createWikiTodoList(projectId, { name: 'Wiki stream TODOs' }, admin);
    const item = todos.addWikiTodoItem(list.id, { text: 'Shared work' }, member);
    todos.updateWikiTodoItem(item.id, { text: 'Updated work', expectedUpdatedAt: item.updatedAt }, admin);
    expect(receivedA.filter((name) => name === 'todo_changed')).toHaveLength(3);
    expect(receivedB.filter((name) => name === 'todo_changed')).toHaveLength(3);
    publishWikiTodoChange('unrelated-project');
    expect(receivedA.filter((name) => name === 'todo_changed')).toHaveLength(3);
    unsubA();
    todos.deleteWikiTodoItem(item.id, {}, member);
    expect(receivedA.filter((name) => name === 'todo_changed')).toHaveLength(3);
    expect(receivedB.filter((name) => name === 'todo_changed')).toHaveLength(4);
    collaboration.stopWikiCollaboration();
    publishWikiTodoChange(projectId);
    expect(receivedB.filter((name) => name === 'todo_changed')).toHaveLength(4);
  } finally {
    unsubA();
    unsubB();
  }
});
