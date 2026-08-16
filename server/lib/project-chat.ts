import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, max } from 'drizzle-orm';
import { createError } from 'h3';
import { db, schema } from './db';
import type { User } from './db/schema';
import {
  AGENT_HARNESSES,
  REASONING_EFFORTS,
  harnessExecutable,
  isAgentHarness,
  isReasoningEffort,
  type AgentHarness,
  type ReasoningEffort,
} from './agent-harness';
import { getProject } from './kanban';

const DEFAULT_CHAT_HARNESS: AgentHarness = 'prime-agent';
const DEFAULT_CHAT_EFFORT: ReasoningEffort = 'xhigh';
const MAX_HISTORY = 100;

export interface CreateProjectChatInput {
  harness?: unknown;
  reasoningEffort?: unknown;
}

export interface UpdateProjectChatInput {
  harness?: unknown;
  reasoningEffort?: unknown;
}

export function getCurrentProjectChat(projectId: string, user: User) {
  getProject(projectId, user);
  const thread = db.select().from(schema.projectChatThreads)
    .where(and(
      eq(schema.projectChatThreads.projectId, projectId),
      eq(schema.projectChatThreads.userId, user.id),
      eq(schema.projectChatThreads.isCurrent, true),
    ))
    .get();
  return {
    chat: thread ? publicProjectChat(thread) : null,
    messages: thread ? listChatMessages(thread.id) : [],
    latestEventId: thread ? latestChatEventId(thread.id) : 0,
    capabilities: projectChatCapabilities(),
  };
}

export function listProjectChats(projectId: string, user: User) {
  getProject(projectId, user);
  const threads = db.select().from(schema.projectChatThreads)
    .where(and(
      eq(schema.projectChatThreads.projectId, projectId),
      eq(schema.projectChatThreads.userId, user.id),
    ))
    .orderBy(desc(schema.projectChatThreads.updatedAt))
    .limit(MAX_HISTORY)
    .all();
  return threads.map((thread) => {
    const preview = db.select({ content: schema.projectChatMessages.content })
      .from(schema.projectChatMessages)
      .where(eq(schema.projectChatMessages.threadId, thread.id))
      .orderBy(desc(schema.projectChatMessages.createdAt), desc(schema.projectChatMessages.id))
      .limit(1)
      .get()?.content ?? '';
    return { ...publicProjectChat(thread), preview: preview.slice(0, 180) };
  });
}

export function createProjectChat(projectId: string, input: CreateProjectChatInput, user: User) {
  getProject(projectId, user);
  const harness = input.harness === undefined
    ? DEFAULT_CHAT_HARNESS
    : requireHarness(input.harness);
  const reasoningEffort = input.reasoningEffort === undefined
    ? DEFAULT_CHAT_EFFORT
    : requireEffort(input.reasoningEffort);
  const now = new Date().toISOString();
  const thread = {
    id: randomUUID(),
    projectId,
    userId: user.id,
    title: '',
    harness,
    reasoningEffort,
    status: 'ready' as const,
    isCurrent: true,
    nativeSessionId: null,
    sourceRevision: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  db.transaction((tx) => {
    tx.update(schema.projectChatThreads).set({ isCurrent: false })
      .where(and(
        eq(schema.projectChatThreads.projectId, projectId),
        eq(schema.projectChatThreads.userId, user.id),
      ))
      .run();
    tx.insert(schema.projectChatThreads).values(thread).run();
  });
  return { chat: publicProjectChat(thread), messages: [], latestEventId: 0 };
}

export function activateProjectChat(threadId: string, user: User) {
  const thread = authorizeProjectChat(threadId, user);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(schema.projectChatThreads).set({ isCurrent: false })
      .where(and(
        eq(schema.projectChatThreads.projectId, thread.projectId),
        eq(schema.projectChatThreads.userId, user.id),
      ))
      .run();
    tx.update(schema.projectChatThreads).set({ isCurrent: true, updatedAt: now })
      .where(eq(schema.projectChatThreads.id, threadId))
      .run();
  });
  return getProjectChat(threadId, user);
}

export function updateProjectChat(threadId: string, input: UpdateProjectChatInput, user: User) {
  const thread = authorizeProjectChat(threadId, user);
  if (thread.status === 'running') {
    throw createError({ statusCode: 409, statusMessage: 'chat_running_config_locked' });
  }
  const messageCount = db.select({ value: schema.projectChatMessages.id })
    .from(schema.projectChatMessages)
    .where(eq(schema.projectChatMessages.threadId, threadId))
    .limit(1)
    .get();
  if (messageCount) {
    throw createError({ statusCode: 409, statusMessage: 'chat_config_locked' });
  }
  const harness = input.harness === undefined ? thread.harness : requireHarness(input.harness);
  const reasoningEffort = input.reasoningEffort === undefined
    ? thread.reasoningEffort
    : requireEffort(input.reasoningEffort);
  db.update(schema.projectChatThreads).set({
    harness,
    reasoningEffort,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.projectChatThreads.id, threadId)).run();
  return getProjectChat(threadId, user);
}

export function getProjectChat(threadId: string, user: User) {
  const thread = authorizeProjectChat(threadId, user);
  return {
    chat: publicProjectChat(thread),
    messages: listChatMessages(thread.id),
    latestEventId: latestChatEventId(thread.id),
  };
}

export function authorizeProjectChat(threadId: string, user: User) {
  const thread = db.select().from(schema.projectChatThreads)
    .where(and(
      eq(schema.projectChatThreads.id, threadId),
      eq(schema.projectChatThreads.userId, user.id),
    ))
    .get();
  if (!thread) throw createError({ statusCode: 404, statusMessage: 'chat_not_found' });
  getProject(thread.projectId, user);
  return thread;
}

export function listChatMessages(threadId: string) {
  return db.select().from(schema.projectChatMessages)
    .where(eq(schema.projectChatMessages.threadId, threadId))
    .orderBy(asc(schema.projectChatMessages.createdAt), asc(schema.projectChatMessages.id))
    .all()
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      state: message.state,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    }));
}

export function listProjectChatEvents(threadId: string, after: number, limit = 250) {
  return db.select().from(schema.projectChatEvents)
    .where(and(
      eq(schema.projectChatEvents.threadId, threadId),
      gt(schema.projectChatEvents.id, Math.max(0, after)),
    ))
    .orderBy(asc(schema.projectChatEvents.id))
    .limit(Math.min(Math.max(limit, 1), 500))
    .all()
    .map((event) => ({
      id: event.id,
      type: event.type,
      payload: parsePayload(event.payload),
      createdAt: event.createdAt,
    }));
}

export function appendProjectChatEvent(threadId: string, type: string, payload: Record<string, unknown>) {
  const result = db.insert(schema.projectChatEvents).values({
    threadId,
    type,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  }).run();
  return Number(result.lastInsertRowid);
}

export function latestChatEventId(threadId: string) {
  return Number(db.select({ value: max(schema.projectChatEvents.id) })
    .from(schema.projectChatEvents)
    .where(eq(schema.projectChatEvents.threadId, threadId))
    .get()?.value ?? 0);
}

export function recoverInterruptedProjectChats() {
  const running = db.select().from(schema.projectChatThreads)
    .where(eq(schema.projectChatThreads.status, 'running'))
    .all();
  if (!running.length) return 0;
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const thread of running) {
      tx.update(schema.projectChatThreads).set({
        status: 'failed',
        lastError: 'chat_interrupted',
        updatedAt: now,
      }).where(eq(schema.projectChatThreads.id, thread.id)).run();
      tx.update(schema.projectChatMessages).set({ state: 'failed', updatedAt: now })
        .where(and(
          eq(schema.projectChatMessages.threadId, thread.id),
          eq(schema.projectChatMessages.state, 'streaming'),
        ))
        .run();
      tx.insert(schema.projectChatEvents).values({
        threadId: thread.id,
        type: 'error',
        payload: JSON.stringify({ code: 'chat_interrupted' }),
        createdAt: now,
      }).run();
    }
  });
  return running.length;
}

export function projectChatCapabilities() {
  return {
    harnesses: AGENT_HARNESSES.map((harness) => ({
      value: harness,
      available: isHarnessAvailable(harness),
    })),
    reasoningEfforts: [...REASONING_EFFORTS],
    defaultHarness: DEFAULT_CHAT_HARNESS,
    defaultReasoningEffort: DEFAULT_CHAT_EFFORT,
  };
}

function publicProjectChat(thread: typeof schema.projectChatThreads.$inferSelect) {
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    harness: thread.harness,
    reasoningEffort: thread.reasoningEffort,
    status: thread.status,
    isCurrent: thread.isCurrent,
    sourceRevision: thread.sourceRevision,
    lastError: thread.lastError,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

function isHarnessAvailable(harness: AgentHarness) {
  try {
    if (harness === 'codex') return true;
    harnessExecutable(harness);
    return true;
  } catch {
    return false;
  }
}

function requireHarness(value: unknown) {
  if (!isAgentHarness(value)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_chat_harness' });
  }
  if (!isHarnessAvailable(value)) {
    throw createError({ statusCode: 503, statusMessage: 'chat_harness_unavailable' });
  }
  return value;
}

function requireEffort(value: unknown) {
  if (!isReasoningEffort(value)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_chat_effort' });
  }
  return value;
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
