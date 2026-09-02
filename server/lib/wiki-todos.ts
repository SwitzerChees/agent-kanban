import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray, max } from 'drizzle-orm';
import { createError } from 'h3';
import { canonicalizeWikiReferences } from '../../utils/wiki-references';
import { db, schema } from './db';
import { getProject } from './kanban';
import type { User, WikiTodoItem, WikiTodoList } from './db/schema';

const MAX_LISTS_PER_PROJECT = 100;
const MAX_ITEMS_PER_LIST = 500;
const MAX_LIST_NAME_LENGTH = 120;
const MAX_ITEM_TEXT_LENGTH = 2000;

export interface CreateWikiTodoListInput {
  name: string;
}

export interface CreateWikiTodoItemInput {
  text: string;
}

export interface UpdateWikiTodoItemInput {
  text?: string;
  completed?: boolean;
  expectedUpdatedAt?: string;
}

export function listWikiTodoLists(projectId: string, user: User) {
  getProject(projectId, user);
  const lists = db.select().from(schema.wikiTodoLists)
    .where(eq(schema.wikiTodoLists.projectId, projectId))
    .orderBy(asc(schema.wikiTodoLists.createdAt))
    .all();
  return decorateLists(lists);
}

export function createWikiTodoList(projectId: string, input: CreateWikiTodoListInput, user: User) {
  getProject(projectId, user);
  const listCount = db.select({ value: count() }).from(schema.wikiTodoLists)
    .where(eq(schema.wikiTodoLists.projectId, projectId)).get()?.value ?? 0;
  if (listCount >= MAX_LISTS_PER_PROJECT) {
    throw createError({ statusCode: 409, statusMessage: 'too_many_wiki_todo_lists' });
  }
  const name = normalizeListName(input.name);
  const now = new Date().toISOString();
  const list: typeof schema.wikiTodoLists.$inferInsert = {
    id: randomUUID(),
    projectId,
    name,
    nameKey: name.toLocaleLowerCase(),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  try {
    db.transaction((tx) => {
      tx.insert(schema.wikiTodoLists).values(list).run();
      tx.insert(schema.activity).values(activity(projectId, user.id, 'wiki_todo_list_created', { listId: list.id, name }, now)).run();
    });
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) {
      throw createError({ statusCode: 409, statusMessage: 'wiki_todo_list_name_exists' });
    }
    throw error;
  }
  return decorateLists([list as WikiTodoList])[0]!;
}

export function addWikiTodoItem(listId: string, input: CreateWikiTodoItemInput, user: User) {
  const list = authorizeList(listId, user);
  const itemCount = db.select({ value: count() }).from(schema.wikiTodoItems)
    .where(eq(schema.wikiTodoItems.listId, listId)).get()?.value ?? 0;
  if (itemCount >= MAX_ITEMS_PER_LIST) {
    throw createError({ statusCode: 409, statusMessage: 'too_many_wiki_todo_items' });
  }
  const currentMax = db.select({ value: max(schema.wikiTodoItems.position) }).from(schema.wikiTodoItems)
    .where(eq(schema.wikiTodoItems.listId, listId)).get()?.value ?? -1000;
  const now = new Date().toISOString();
  const item: typeof schema.wikiTodoItems.$inferInsert = {
    id: randomUUID(),
    listId,
    text: normalizeItemText(list.projectId, input.text),
    completed: false,
    completedAt: null,
    position: currentMax + 1000,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(schema.wikiTodoItems).values(item).run();
    tx.update(schema.wikiTodoLists).set({ updatedBy: user.id, updatedAt: now })
      .where(eq(schema.wikiTodoLists.id, listId)).run();
    tx.insert(schema.activity).values(activity(list.projectId, user.id, 'wiki_todo_item_created', { listId, itemId: item.id }, now)).run();
  });
  return item as WikiTodoItem;
}

export function updateWikiTodoItem(itemId: string, input: UpdateWikiTodoItemInput, user: User) {
  const item = db.select().from(schema.wikiTodoItems).where(eq(schema.wikiTodoItems.id, itemId)).get();
  if (!item) throw createError({ statusCode: 404, statusMessage: 'wiki_todo_item_not_found' });
  const list = authorizeList(item.listId, user);
  if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== item.updatedAt) {
    throw createError({ statusCode: 409, statusMessage: 'wiki_todo_item_stale' });
  }
  if (input.text === undefined && input.completed === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'wiki_todo_item_update_required' });
  }
  const now = new Date().toISOString();
  const updates: Partial<typeof schema.wikiTodoItems.$inferInsert> = {
    updatedBy: user.id,
    updatedAt: now,
  };
  if (input.text !== undefined) updates.text = normalizeItemText(list.projectId, input.text);
  if (input.completed !== undefined) {
    updates.completed = input.completed;
    updates.completedAt = input.completed ? now : null;
  }
  db.transaction((tx) => {
    tx.update(schema.wikiTodoItems).set(updates).where(and(
      eq(schema.wikiTodoItems.id, itemId),
      eq(schema.wikiTodoItems.updatedAt, item.updatedAt),
    )).run();
    tx.update(schema.wikiTodoLists).set({ updatedBy: user.id, updatedAt: now })
      .where(eq(schema.wikiTodoLists.id, list.id)).run();
    tx.insert(schema.activity).values(activity(list.projectId, user.id, 'wiki_todo_item_updated', {
      listId: list.id,
      itemId,
      fields: Object.keys(input).filter((field) => field !== 'expectedUpdatedAt'),
    }, now)).run();
  });
  return db.select().from(schema.wikiTodoItems).where(eq(schema.wikiTodoItems.id, itemId)).get()!;
}

function authorizeList(listId: string, user: User) {
  const list = db.select().from(schema.wikiTodoLists).where(eq(schema.wikiTodoLists.id, listId)).get();
  if (!list) throw createError({ statusCode: 404, statusMessage: 'wiki_todo_list_not_found' });
  getProject(list.projectId, user);
  return list;
}

function decorateLists(lists: WikiTodoList[]) {
  const items = lists.length
    ? db.select().from(schema.wikiTodoItems)
        .where(inArray(schema.wikiTodoItems.listId, lists.map((list) => list.id)))
        .orderBy(asc(schema.wikiTodoItems.position), asc(schema.wikiTodoItems.createdAt))
        .all()
    : [];
  const references = new Map(
    [...new Set(lists.map((list) => list.projectId))]
      .map((projectId) => [projectId, wikiTodoReferenceContext(projectId)] as const),
  );
  return lists.map((list) => {
    const referenceContext = references.get(list.projectId)!;
    return {
      ...list,
      items: items.filter((item) => item.listId === list.id).map((item) => ({
        ...item,
        text: canonicalizeWikiReferences(item.text, referenceContext.members, referenceContext.tasks),
      })),
    };
  });
}

function normalizeListName(value: string) {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw createError({ statusCode: 400, statusMessage: 'wiki_todo_list_name_required' });
  if (name.length > MAX_LIST_NAME_LENGTH) throw createError({ statusCode: 400, statusMessage: 'wiki_todo_list_name_too_long' });
  return name;
}

function normalizeItemText(projectId: string, value: string) {
  const text = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[\t ]+/g, ' '))
    .join('\n')
    .trim();
  if (!text) throw createError({ statusCode: 400, statusMessage: 'wiki_todo_item_text_required' });
  if (text.length > MAX_ITEM_TEXT_LENGTH) throw createError({ statusCode: 400, statusMessage: 'wiki_todo_item_text_too_long' });
  const { members, tasks } = wikiTodoReferenceContext(projectId);
  return canonicalizeWikiReferences(text, members, tasks);
}

function wikiTodoReferenceContext(projectId: string) {
  const members = db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.projectUsers)
    .innerJoin(schema.users, eq(schema.projectUsers.userId, schema.users.id))
    .where(eq(schema.projectUsers.projectId, projectId))
    .all();
  const tasks = db.select({ id: schema.tasks.id, key: schema.tasks.key, title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .all();
  return { members, tasks };
}

function activity(projectId: string, userId: string, action: string, metadata: Record<string, unknown>, createdAt: string) {
  return {
    id: randomUUID(),
    projectId,
    taskId: null,
    userId,
    action,
    metadata: JSON.stringify(metadata),
    createdAt,
  };
}
