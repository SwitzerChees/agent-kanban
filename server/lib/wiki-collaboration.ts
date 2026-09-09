import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createError } from 'h3';
import * as Y from 'yjs';
import {
  createWikiCollaborationDocument,
  serializeWikiCollaborationDocument,
  WIKI_COLLABORATION_META,
} from '../../utils/wiki-collaboration-document';
import type { WikiCollaborationLease } from '../../utils/wiki-collaboration-blocks';
import { canonicalizeWikiReferences } from '../../utils/wiki-references';
import { db, schema } from './db';
import type { User, WikiPage } from './db/schema';
import { getProject } from './kanban';
import { registerWikiPageInvalidation } from './wiki-collaboration-events';

const SESSION_TTL_MS = 15_000;
const ROOM_TTL_MS = 60_000;
const ACTIVITY_DEBOUNCE_MS = 1_500;
const MAX_UPDATE_BYTES = 1_500_000;
const MAX_DOCUMENT_BYTES = 4_000_000;
const MAX_WIKI_TITLE_LENGTH = 200;
const MAX_WIKI_CONTENT_LENGTH = 1_000_000;
const MAX_ROOM_SESSIONS = 100;
const UPDATE_RATE_WINDOW_MS = 10_000;
const MAX_UPDATES_PER_WINDOW = 120;
const colors = ['#0d9488', '#2563eb', '#9333ea', '#e11d48', '#d97706', '#059669', '#4f46e5', '#c026d3'];

export interface WikiCollaborationParticipant {
  sessionId: string;
  userId: string;
  userName: string;
  color: string;
  editing: boolean;
}

export interface WikiCollaborationPresence {
  participants: WikiCollaborationParticipant[];
  leases: WikiCollaborationLease[];
}

export interface WikiCollaborationPageUpdate {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

interface CollaborationSession extends WikiCollaborationParticipant {
  clientId: string;
  blockId: string | null;
  generation: string;
  lastSeenAt: number;
  updateTimestamps: number[];
}

interface CollaborationSubscriber {
  send: (event: string, payload: unknown) => void;
  close: () => void;
}

interface CollaborationRoom {
  pageId: string;
  projectId: string;
  document: Y.Doc;
  sourceUpdatedAt: string;
  generation: string;
  sessions: Map<string, CollaborationSession>;
  subscribers: Map<string, CollaborationSubscriber>;
  lastActiveAt: number;
  activityTimer: ReturnType<typeof setTimeout> | null;
  activityUser: User | null;
}

const rooms = new Map<string, CollaborationRoom>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

registerWikiPageInvalidation((pageId) => {
  const room = rooms.get(pageId);
  if (!room) return;
  const page = db.select().from(schema.wikiPages).where(eq(schema.wikiPages.id, pageId)).get();
  if (!page) {
    broadcast(room, 'reload', { reason: 'deleted' });
    disposeRoom(room);
    return;
  }
  reconcileRoomWithPage(room, page, true);
});

export function createWikiCollaborationSession(pageId: string, clientId: string, user: User) {
  const page = authorizePage(pageId, user);
  const room = getOrCreateRoom(page);
  cleanupSessions(room);
  if (room.sessions.size >= MAX_ROOM_SESSIONS) {
    throw createError({ statusCode: 429, statusMessage: 'wiki_collaboration_too_many_sessions' });
  }
  const session: CollaborationSession = {
    sessionId: randomUUID(),
    clientId,
    userId: user.id,
    userName: user.name,
    color: collaborationColor(user.id),
    editing: false,
    blockId: null,
    generation: room.generation,
    lastSeenAt: Date.now(),
    updateTimestamps: [],
  };
  room.sessions.set(session.sessionId, session);
  touchRoom(room);
  ensureSweepTimer();
  const presence = roomPresence(room);
  broadcast(room, 'presence', presence);
  return {
    sessionId: session.sessionId,
    generation: room.generation,
    state: encodeUpdate(Y.encodeStateAsUpdate(room.document)),
    page: collaborationPageUpdate(page, user.name),
    ...presence,
  };
}

export function subscribeWikiCollaboration(
  pageId: string,
  sessionId: string,
  user: User,
  subscriber: CollaborationSubscriber,
) {
  const page = authorizePage(pageId, user);
  const room = getOrCreateRoom(page);
  const session = requireSession(room, sessionId, user);
  session.lastSeenAt = Date.now();
  const subscriberId = randomUUID();
  room.subscribers.set(subscriberId, subscriber);
  touchRoom(room);
  subscriber.send('sync', {
    generation: room.generation,
    state: encodeUpdate(Y.encodeStateAsUpdate(room.document)),
    page: currentPageUpdate(pageId),
    ...roomPresence(room),
  });
  return () => {
    room.subscribers.delete(subscriberId);
    touchRoom(room);
  };
}

export function applyWikiCollaborationUpdate(pageId: string, sessionId: string, encodedUpdate: string, user: User) {
  const page = authorizePage(pageId, user);
  const room = getOrCreateRoom(page);
  const session = requireSession(room, sessionId, user);
  enforceUpdateRate(session);
  const update = decodeUpdate(encodedUpdate);
  if (!update.byteLength || update.byteLength > MAX_UPDATE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'wiki_collaboration_update_too_large' });
  }

  const candidate = new Y.Doc();
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.document));
  try {
    Y.applyUpdate(candidate, update);
  } catch {
    candidate.destroy();
    throw createError({ statusCode: 400, statusMessage: 'invalid_wiki_collaboration_update' });
  }

  const snapshot = serializeWikiCollaborationDocument(candidate);
  const title = snapshot.title.trim() || page.title;
  if (title.length > MAX_WIKI_TITLE_LENGTH) {
    candidate.destroy();
    throw createError({ statusCode: 413, statusMessage: 'wiki_title_too_long' });
  }
  if (snapshot.title !== title) candidate.getMap<string>(WIKI_COLLABORATION_META).set('title', title);
  const content = normalizeCollaborationContent(page.projectId, snapshot.content);
  if (content.length > MAX_WIKI_CONTENT_LENGTH) {
    candidate.destroy();
    throw createError({ statusCode: 413, statusMessage: 'wiki_content_too_large' });
  }
  const state = Y.encodeStateAsUpdate(candidate);
  if (state.byteLength > MAX_DOCUMENT_BYTES) {
    candidate.destroy();
    throw createError({ statusCode: 413, statusMessage: 'wiki_collaboration_document_too_large' });
  }

  const acceptedUpdate = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(room.document));
  const updatedAt = nextRevision(page.updatedAt);
  db.transaction((tx) => {
    tx.update(schema.wikiPages).set({
      title,
      content,
      updatedBy: user.id,
      updatedAt,
    }).where(eq(schema.wikiPages.id, pageId)).run();
    tx.insert(schema.wikiCollaborationDocuments).values({
      pageId,
      state: Buffer.from(state),
      generation: room.generation,
      sourceUpdatedAt: updatedAt,
      updatedAt,
    }).onConflictDoUpdate({
      target: schema.wikiCollaborationDocuments.pageId,
      set: {
        state: Buffer.from(state),
        generation: room.generation,
        sourceUpdatedAt: updatedAt,
        updatedAt,
      },
    }).run();
  });

  room.document.destroy();
  room.document = candidate;
  room.sourceUpdatedAt = updatedAt;
  session.lastSeenAt = Date.now();
  touchRoom(room);
  const pageUpdate: WikiCollaborationPageUpdate = {
    id: pageId,
    title,
    content,
    updatedAt,
    updatedBy: user.id,
    updatedByName: user.name,
  };
  broadcast(room, 'update', {
    generation: room.generation,
    update: encodeUpdate(acceptedUpdate),
    page: pageUpdate,
  });
  scheduleActivity(room, user);
  return { page: pageUpdate, ...roomPresence(room) };
}

export function updateWikiCollaborationPresence(
  pageId: string,
  sessionId: string,
  input: { editing: boolean; blockId?: string | null },
  user: User,
) {
  const page = authorizePage(pageId, user);
  const room = getOrCreateRoom(page);
  cleanupSessions(room);
  const session = requireSession(room, sessionId, user);
  const requestedBlock = input.editing && input.blockId ? input.blockId : null;
  const holder = requestedBlock
    ? [...room.sessions.values()].find((candidate) => (
        candidate.sessionId !== session.sessionId
        && candidate.generation === room.generation
        && candidate.blockId === requestedBlock
        && candidate.lastSeenAt >= Date.now() - SESSION_TTL_MS
      ))
    : undefined;
  session.editing = input.editing;
  session.blockId = holder ? null : requestedBlock;
  session.lastSeenAt = Date.now();
  touchRoom(room);
  const presence = roomPresence(room);
  broadcast(room, 'presence', presence);
  return {
    granted: !holder,
    lockedBy: holder ? participant(holder) : null,
    ...presence,
  };
}

export function closeWikiCollaborationSession(pageId: string, sessionId: string, user: User) {
  authorizePage(pageId, user);
  const room = rooms.get(pageId);
  if (!room) return { ok: true };
  const session = room.sessions.get(sessionId);
  if (session && session.userId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'wiki_collaboration_session_forbidden' });
  }
  room.sessions.delete(sessionId);
  touchRoom(room);
  broadcast(room, 'presence', roomPresence(room));
  return { ok: true };
}

export function stopWikiCollaboration() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  for (const room of [...rooms.values()]) disposeRoom(room);
}

function authorizePage(pageId: string, user: User) {
  const page = db.select().from(schema.wikiPages).where(eq(schema.wikiPages.id, pageId)).get();
  if (!page) throw createError({ statusCode: 404, statusMessage: 'wiki_page_not_found' });
  getProject(page.projectId, user);
  return page;
}

function getOrCreateRoom(page: WikiPage) {
  const existing = rooms.get(page.id);
  if (existing) {
    reconcileRoomWithPage(existing, page, false);
    return existing;
  }
  const persisted = db.select().from(schema.wikiCollaborationDocuments)
    .where(eq(schema.wikiCollaborationDocuments.pageId, page.id)).get();
  let document: Y.Doc;
  if (persisted?.sourceUpdatedAt === page.updatedAt) {
    document = new Y.Doc();
    try {
      Y.applyUpdate(document, new Uint8Array(persisted.state));
    } catch {
      document.destroy();
      document = createWikiCollaborationDocument(page.title, page.content);
    }
  } else {
    document = createWikiCollaborationDocument(page.title, page.content);
  }
  const room: CollaborationRoom = {
    pageId: page.id,
    projectId: page.projectId,
    document,
    sourceUpdatedAt: page.updatedAt,
    generation: persisted?.sourceUpdatedAt === page.updatedAt ? persisted.generation : randomUUID(),
    sessions: new Map(),
    subscribers: new Map(),
    lastActiveAt: Date.now(),
    activityTimer: null,
    activityUser: null,
  };
  rooms.set(page.id, room);
  persistRoom(room);
  return room;
}

function reconcileRoomWithPage(room: CollaborationRoom, page: WikiPage, broadcastReload: boolean) {
  if (page.updatedAt === room.sourceUpdatedAt) return;
  const snapshot = serializeWikiCollaborationDocument(room.document);
  const normalizedContent = normalizeCollaborationContent(page.projectId, snapshot.content);
  const title = snapshot.title.trim();
  if ((!title || title === page.title) && normalizedContent === page.content) {
    room.sourceUpdatedAt = page.updatedAt;
    persistRoom(room);
    return;
  }

  const document = createWikiCollaborationDocument(page.title, page.content);
  room.document.destroy();
  room.document = document;
  room.sourceUpdatedAt = page.updatedAt;
  room.generation = randomUUID();
  room.sessions.clear();
  persistRoom(room);
  if (broadcastReload) broadcast(room, 'reload', { reason: 'external_update' });
}

function persistRoom(room: CollaborationRoom) {
  const now = new Date().toISOString();
  const state = Buffer.from(Y.encodeStateAsUpdate(room.document));
  db.insert(schema.wikiCollaborationDocuments).values({
    pageId: room.pageId,
    state,
    generation: room.generation,
    sourceUpdatedAt: room.sourceUpdatedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: schema.wikiCollaborationDocuments.pageId,
      set: { state, generation: room.generation, sourceUpdatedAt: room.sourceUpdatedAt, updatedAt: now },
  }).run();
}

function requireSession(room: CollaborationRoom, sessionId: string, user: User) {
  const session = room.sessions.get(sessionId);
  if (!session) throw createError({ statusCode: 409, statusMessage: 'wiki_collaboration_session_expired' });
  if (session.userId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'wiki_collaboration_session_forbidden' });
  }
  if (session.generation !== room.generation) {
    throw createError({ statusCode: 409, statusMessage: 'wiki_collaboration_reset' });
  }
  return session;
}

function enforceUpdateRate(session: CollaborationSession) {
  const now = Date.now();
  session.updateTimestamps = session.updateTimestamps.filter((timestamp) => now - timestamp < UPDATE_RATE_WINDOW_MS);
  if (session.updateTimestamps.length >= MAX_UPDATES_PER_WINDOW) {
    throw createError({ statusCode: 429, statusMessage: 'wiki_collaboration_rate_limited' });
  }
  session.updateTimestamps.push(now);
}

function roomPresence(room: CollaborationRoom): WikiCollaborationPresence {
  const active = [...room.sessions.values()]
    .filter((session) => session.generation === room.generation && session.lastSeenAt >= Date.now() - SESSION_TTL_MS);
  return {
    participants: active.map(participant),
    leases: active.filter((session) => session.editing && session.blockId).map((session) => ({
      blockId: session.blockId!,
      sessionId: session.sessionId,
      userId: session.userId,
      userName: session.userName,
      color: session.color,
      expiresAt: new Date(session.lastSeenAt + SESSION_TTL_MS).toISOString(),
    })),
  };
}

function participant(session: CollaborationSession): WikiCollaborationParticipant {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    userName: session.userName,
    color: session.color,
    editing: session.editing,
  };
}

function currentPageUpdate(pageId: string) {
  const row = db.select({
    page: schema.wikiPages,
    updatedByName: schema.users.name,
  }).from(schema.wikiPages)
    .innerJoin(schema.users, eq(schema.wikiPages.updatedBy, schema.users.id))
    .where(eq(schema.wikiPages.id, pageId)).get();
  if (!row) throw createError({ statusCode: 404, statusMessage: 'wiki_page_not_found' });
  return collaborationPageUpdate(row.page, row.updatedByName);
}

function collaborationPageUpdate(page: WikiPage, updatedByName: string): WikiCollaborationPageUpdate {
  return {
    id: page.id,
    title: page.title,
    content: page.content,
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy,
    updatedByName,
  };
}

function normalizeCollaborationContent(projectId: string, content: string) {
  const members = db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.projectUsers)
    .innerJoin(schema.users, eq(schema.projectUsers.userId, schema.users.id))
    .where(eq(schema.projectUsers.projectId, projectId)).all();
  const tasks = db.select({ id: schema.tasks.id, key: schema.tasks.key, title: schema.tasks.title })
    .from(schema.tasks).where(eq(schema.tasks.projectId, projectId)).all();
  const normalized = canonicalizeWikiReferences(content, members, tasks);
  if (normalized.length > MAX_WIKI_CONTENT_LENGTH) {
    throw createError({ statusCode: 413, statusMessage: 'wiki_content_too_large' });
  }
  return normalized;
}

function decodeUpdate(value: string) {
  try {
    return new Uint8Array(Buffer.from(value, 'base64'));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_wiki_collaboration_update' });
  }
}

function encodeUpdate(value: Uint8Array) {
  return Buffer.from(value).toString('base64');
}

function nextRevision(previous: string) {
  const previousTime = Date.parse(previous);
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

function collaborationColor(userId: string) {
  let hash = 0;
  for (const character of userId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}

function broadcast(room: CollaborationRoom, event: string, payload: unknown) {
  for (const [subscriberId, subscriber] of room.subscribers) {
    try {
      subscriber.send(event, payload);
    } catch {
      room.subscribers.delete(subscriberId);
      subscriber.close();
    }
  }
}

function touchRoom(room: CollaborationRoom) {
  room.lastActiveAt = Date.now();
}

function cleanupSessions(room: CollaborationRoom) {
  const threshold = Date.now() - SESSION_TTL_MS;
  let changed = false;
  for (const [sessionId, session] of room.sessions) {
    if (session.lastSeenAt >= threshold && session.generation === room.generation) continue;
    room.sessions.delete(sessionId);
    changed = true;
  }
  if (changed) broadcast(room, 'presence', roomPresence(room));
}

function ensureSweepTimer() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      cleanupSessions(room);
      if (!room.sessions.size && !room.subscribers.size && now - room.lastActiveAt >= ROOM_TTL_MS) {
        disposeRoom(room);
      }
    }
    if (!rooms.size && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, 5_000);
  sweepTimer.unref();
}

function scheduleActivity(room: CollaborationRoom, user: User) {
  room.activityUser = user;
  if (room.activityTimer) clearTimeout(room.activityTimer);
  room.activityTimer = setTimeout(() => flushActivity(room), ACTIVITY_DEBOUNCE_MS);
  room.activityTimer.unref();
}

function flushActivity(room: CollaborationRoom) {
  if (room.activityTimer) clearTimeout(room.activityTimer);
  room.activityTimer = null;
  const user = room.activityUser;
  room.activityUser = null;
  if (!user) return;
  db.insert(schema.activity).values({
    id: randomUUID(),
    projectId: room.projectId,
    taskId: null,
    userId: user.id,
    action: 'wiki_page_updated',
    metadata: JSON.stringify({ pageId: room.pageId, fields: ['title', 'content'], collaboration: true }),
    createdAt: new Date().toISOString(),
  }).run();
}

function disposeRoom(room: CollaborationRoom) {
  flushActivity(room);
  for (const subscriber of room.subscribers.values()) subscriber.close();
  room.subscribers.clear();
  room.sessions.clear();
  room.document.destroy();
  rooms.delete(room.pageId);
}
