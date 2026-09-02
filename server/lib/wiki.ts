import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { and, asc, count, eq, inArray, isNull, max } from 'drizzle-orm';
import { createError } from 'h3';
import { canonicalizeWikiReferences } from '../../utils/wiki-references';
import { db, schema } from './db';
import { getProject } from './kanban';
import type { User, WikiPage } from './db/schema';

const MAX_PAGES_PER_PROJECT = 500;
const MAX_WIKI_TITLE_LENGTH = 200;
const MAX_WIKI_CONTENT_LENGTH = 1_000_000;

export interface CreateWikiPageInput {
  title: string;
  content?: string;
  parentId?: string | null;
}

export interface UpdateWikiPageInput {
  title?: string;
  content?: string;
  parentId?: string | null;
  position?: number;
  expectedUpdatedAt?: string;
}

export interface MoveWikiPageInput {
  parentId: string | null;
  position: number;
  expectedUpdatedAt?: string;
}

export function listWikiPages(projectId: string, user: User) {
  getProject(projectId, user);
  return decorateWikiPages(db.select().from(schema.wikiPages)
    .where(eq(schema.wikiPages.projectId, projectId))
    .orderBy(asc(schema.wikiPages.position), asc(schema.wikiPages.createdAt))
    .all());
}

export function getWikiPage(pageId: string, user: User) {
  const page = authorizeWikiPage(pageId, user);
  return decorateWikiPages([page])[0]!;
}

export function createWikiPage(projectId: string, input: CreateWikiPageInput, user: User) {
  getProject(projectId, user);
  const pageCount = db.select({ value: count() }).from(schema.wikiPages)
    .where(eq(schema.wikiPages.projectId, projectId)).get()?.value ?? 0;
  if (pageCount >= MAX_PAGES_PER_PROJECT) {
    throw createError({ statusCode: 409, statusMessage: 'too_many_wiki_pages' });
  }

  const title = normalizeTitle(input.title);
  const content = normalizeProjectWikiContent(projectId, input.content ?? '');
  const parentId = input.parentId ?? null;
  if (parentId) authorizeParent(projectId, parentId);

  const currentMax = db.select({ value: max(schema.wikiPages.position) }).from(schema.wikiPages)
    .where(parentId
      ? and(eq(schema.wikiPages.projectId, projectId), eq(schema.wikiPages.parentId, parentId))
      : and(eq(schema.wikiPages.projectId, projectId), isNull(schema.wikiPages.parentId)))
    .get()?.value ?? -1000;
  const now = new Date().toISOString();
  const page: typeof schema.wikiPages.$inferInsert = {
    id: randomUUID(),
    projectId,
    parentId,
    title,
    content,
    position: currentMax + 1000,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(schema.wikiPages).values(page).run();
    tx.insert(schema.activity).values({
      id: randomUUID(),
      projectId,
      taskId: null,
      userId: user.id,
      action: 'wiki_page_created',
      metadata: JSON.stringify({ pageId: page.id, title: page.title, parentId }),
      createdAt: now,
    }).run();
  });
  return decorateWikiPage(page as WikiPage, new Map([[user.id, user.name]]));
}

export function updateWikiPage(pageId: string, input: UpdateWikiPageInput, user: User) {
  const page = authorizeWikiPage(pageId, user);
  assertWikiPageRevision(page, input.expectedUpdatedAt);
  const updates: Partial<typeof schema.wikiPages.$inferInsert> = {
    updatedBy: user.id,
    updatedAt: new Date().toISOString(),
  };
  if (input.title !== undefined) updates.title = normalizeTitle(input.title);
  if (input.content !== undefined) updates.content = normalizeProjectWikiContent(page.projectId, input.content);
  if (input.position !== undefined) updates.position = input.position;
  if (input.parentId !== undefined) {
    if (input.parentId === pageId) {
      throw createError({ statusCode: 400, statusMessage: 'wiki_page_cycle' });
    }
    if (input.parentId) {
      authorizeParent(page.projectId, input.parentId);
      assertNoWikiPageCycle(pageId, input.parentId);
    }
    updates.parentId = input.parentId;
  }

  db.transaction((tx) => {
    tx.update(schema.wikiPages).set(updates).where(eq(schema.wikiPages.id, pageId)).run();
    tx.insert(schema.activity).values({
      id: randomUUID(),
      projectId: page.projectId,
      taskId: null,
      userId: user.id,
      action: 'wiki_page_updated',
      metadata: JSON.stringify({ pageId, fields: Object.keys(input).filter((field) => field !== 'expectedUpdatedAt') }),
      createdAt: updates.updatedAt!,
    }).run();
  });
  return listWikiPages(page.projectId, user).find((item) => item.id === pageId)!;
}

export function moveWikiPage(pageId: string, input: MoveWikiPageInput, user: User) {
  const page = authorizeWikiPage(pageId, user);
  assertWikiPageRevision(page, input.expectedUpdatedAt);
  const targetParentId = input.parentId ?? null;
  if (targetParentId === pageId) {
    throw createError({ statusCode: 400, statusMessage: 'wiki_page_cycle' });
  }
  if (targetParentId) {
    authorizeParent(page.projectId, targetParentId);
    assertNoWikiPageCycle(pageId, targetParentId);
  }

  const pages = db.select().from(schema.wikiPages)
    .where(eq(schema.wikiPages.projectId, page.projectId))
    .orderBy(asc(schema.wikiPages.position), asc(schema.wikiPages.createdAt))
    .all();
  const oldParentId = page.parentId ?? null;
  const targetSiblings = pages.filter((candidate) => (
    candidate.id !== pageId && (candidate.parentId ?? null) === targetParentId
  ));
  const targetIndex = Math.min(Math.max(input.position, 0), targetSiblings.length);
  targetSiblings.splice(targetIndex, 0, { ...page, parentId: targetParentId });
  const oldSiblings = oldParentId === targetParentId
    ? []
    : pages.filter((candidate) => candidate.id !== pageId && (candidate.parentId ?? null) === oldParentId);
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const [index, sibling] of targetSiblings.entries()) {
      tx.update(schema.wikiPages).set({
        parentId: sibling.id === pageId ? targetParentId : sibling.parentId,
        position: index * 1000,
        ...(sibling.id === pageId ? { updatedBy: user.id, updatedAt: now } : {}),
      }).where(eq(schema.wikiPages.id, sibling.id)).run();
    }
    for (const [index, sibling] of oldSiblings.entries()) {
      tx.update(schema.wikiPages).set({ position: index * 1000 })
        .where(eq(schema.wikiPages.id, sibling.id)).run();
    }
    tx.insert(schema.activity).values({
      id: randomUUID(),
      projectId: page.projectId,
      taskId: null,
      userId: user.id,
      action: 'wiki_page_moved',
      metadata: JSON.stringify({
        pageId,
        fromParentId: oldParentId,
        parentId: targetParentId,
        position: targetIndex,
      }),
      createdAt: now,
    }).run();
  });

  const result = listWikiPages(page.projectId, user);
  return {
    page: result.find((item) => item.id === pageId)!,
    pages: result,
  };
}

export function deleteWikiPage(pageId: string, user: User) {
  const page = authorizeWikiPage(pageId, user);
  const child = db.select({ id: schema.wikiPages.id }).from(schema.wikiPages)
    .where(eq(schema.wikiPages.parentId, pageId)).get();
  if (child) throw createError({ statusCode: 409, statusMessage: 'wiki_page_not_empty' });
  const images = db.select({
    storagePath: schema.wikiImages.storagePath,
    renderedStoragePath: schema.wikiImages.renderedStoragePath,
  }).from(schema.wikiImages).where(eq(schema.wikiImages.pageId, pageId)).all();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(schema.wikiPages).where(eq(schema.wikiPages.id, pageId)).run();
    tx.insert(schema.activity).values({
      id: randomUUID(),
      projectId: page.projectId,
      taskId: null,
      userId: user.id,
      action: 'wiki_page_deleted',
      metadata: JSON.stringify({ pageId, title: page.title }),
      createdAt: now,
    }).run();
  });
  for (const image of images) {
    try {
      rmSync(image.storagePath, { force: true });
      if (image.renderedStoragePath) rmSync(image.renderedStoragePath, { force: true });
    } catch {
      // The database deletion is authoritative; orphan cleanup may be retried operationally.
    }
  }
  return { ok: true };
}

export function authorizeWikiPage(pageId: string, user: User) {
  const page = db.select().from(schema.wikiPages).where(eq(schema.wikiPages.id, pageId)).get();
  if (!page) throw createError({ statusCode: 404, statusMessage: 'wiki_page_not_found' });
  getProject(page.projectId, user);
  return page;
}

function authorizeParent(projectId: string, parentId: string) {
  const parent = db.select({ projectId: schema.wikiPages.projectId }).from(schema.wikiPages)
    .where(eq(schema.wikiPages.id, parentId)).get();
  if (!parent || parent.projectId !== projectId) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_wiki_parent' });
  }
}

function assertNoWikiPageCycle(pageId: string, parentId: string) {
  const visited = new Set([pageId]);
  let cursor: string | null = parentId;
  while (cursor) {
    if (visited.has(cursor)) throw createError({ statusCode: 400, statusMessage: 'wiki_page_cycle' });
    visited.add(cursor);
    cursor = db.select({ parentId: schema.wikiPages.parentId }).from(schema.wikiPages)
      .where(eq(schema.wikiPages.id, cursor)).get()?.parentId ?? null;
  }
}

function assertWikiPageRevision(page: WikiPage, expectedUpdatedAt: string | undefined) {
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== page.updatedAt) {
    throw createError({ statusCode: 409, statusMessage: 'wiki_page_stale' });
  }
}

function normalizeTitle(value: string) {
  const title = value.trim();
  if (!title) throw createError({ statusCode: 400, statusMessage: 'wiki_title_required' });
  if (title.length > MAX_WIKI_TITLE_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'wiki_title_too_long' });
  }
  return title;
}

function normalizeContent(value: string) {
  if (value.length > MAX_WIKI_CONTENT_LENGTH) {
    throw createError({ statusCode: 413, statusMessage: 'wiki_content_too_large' });
  }
  return value;
}

function normalizeProjectWikiContent(projectId: string, value: string) {
  normalizeContent(value);
  const { members, tasks } = wikiReferenceContext(projectId);
  return normalizeContent(canonicalizeWikiReferences(value, members, tasks));
}

function wikiReferenceContext(projectId: string) {
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

function decorateWikiPages(pages: WikiPage[]) {
  const userIds = [...new Set(pages.flatMap((page) => [page.createdBy, page.updatedBy]))];
  const users = userIds.length
    ? db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
        .where(inArray(schema.users.id, userIds)).all()
    : [];
  const names = new Map(users.map((item) => [item.id, item.name]));
  const references = new Map(
    [...new Set(pages.map((page) => page.projectId))]
      .map((projectId) => [projectId, wikiReferenceContext(projectId)] as const),
  );
  return pages.map((page) => decorateWikiPage(page, names, references.get(page.projectId)));
}

function decorateWikiPage(
  page: WikiPage,
  names: Map<string, string>,
  references = wikiReferenceContext(page.projectId),
) {
  return {
    ...page,
    content: normalizeContent(canonicalizeWikiReferences(page.content, references.members, references.tasks)),
    createdByName: names.get(page.createdBy) ?? null,
    updatedByName: names.get(page.updatedBy) ?? null,
  };
}
