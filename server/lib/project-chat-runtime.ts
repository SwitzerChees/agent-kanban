import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, desc, eq } from 'drizzle-orm';
import { createError } from 'h3';
import { appDataDir, db, schema } from './db';
import type { User } from './db/schema';
import { loadAgentsContext } from './agents-context';
import { prepareTaskWorktree } from './git-workspaces';
import { runtimeLogger } from './logger';
import {
  appendProjectChatEvent,
  authorizeProjectChat,
  latestChatEventId,
  recoverInterruptedProjectChats,
} from './project-chat';
import {
  runProjectChatHarnessTurn,
  stopSandboxUnit,
  type ProjectChatActivity,
} from './project-chat-harness';

const execFileAsync = promisify(execFile);
const MAX_MESSAGE_LENGTH = 24_000;
const DRAFT_FLUSH_MS = 160;

interface ActiveChatJob {
  controller: AbortController;
  unitName: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __agentKanbanProjectChatRuntime: ProjectChatRuntime | undefined;
}

export function startProjectChatRuntime() {
  if (!globalThis.__agentKanbanProjectChatRuntime) {
    const recovered = recoverInterruptedProjectChats();
    if (recovered) runtimeLogger.warn('recovered interrupted project chats', { count: recovered });
    globalThis.__agentKanbanProjectChatRuntime = new ProjectChatRuntime();
  }
  return globalThis.__agentKanbanProjectChatRuntime;
}

export function projectChatRuntime() {
  return globalThis.__agentKanbanProjectChatRuntime ?? startProjectChatRuntime();
}

export class ProjectChatRuntime {
  private readonly jobs = new Map<string, ActiveChatJob>();

  queueMessage(threadId: string, body: string, clientRequestId: string | null, user: User) {
    const thread = authorizeProjectChat(threadId, user);
    const content = body.trim();
    if (!content) throw createError({ statusCode: 400, statusMessage: 'empty_chat_message' });
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw createError({ statusCode: 400, statusMessage: 'chat_message_too_long' });
    }
    if (thread.status === 'running' || this.jobs.has(threadId)) {
      throw createError({ statusCode: 409, statusMessage: 'chat_turn_already_running' });
    }

    if (clientRequestId) {
      const existing = db.select().from(schema.projectChatMessages)
        .where(and(
          eq(schema.projectChatMessages.threadId, threadId),
          eq(schema.projectChatMessages.clientRequestId, clientRequestId),
        ))
        .get();
      if (existing) {
        return { accepted: true, duplicate: true, latestEventId: latestChatEventId(threadId) };
      }
    }

    const { userCreatedAt, assistantCreatedAt } = turnMessageTimestamps();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const title = thread.title || conversationTitle(content);
    db.transaction((tx) => {
      tx.insert(schema.projectChatMessages).values({
        id: userMessageId,
        threadId,
        role: 'user',
        content,
        state: 'complete',
        clientRequestId,
        createdAt: userCreatedAt,
        updatedAt: userCreatedAt,
      }).run();
      tx.insert(schema.projectChatMessages).values({
        id: assistantMessageId,
        threadId,
        role: 'assistant',
        content: '',
        state: 'streaming',
        clientRequestId: null,
        createdAt: assistantCreatedAt,
        updatedAt: assistantCreatedAt,
      }).run();
      tx.update(schema.projectChatThreads).set({
        title,
        status: 'running',
        lastError: null,
        updatedAt: assistantCreatedAt,
      }).where(eq(schema.projectChatThreads.id, threadId)).run();
      tx.insert(schema.projectChatEvents).values({
        threadId,
        type: 'turn_started',
        payload: JSON.stringify({ userMessageId, assistantMessageId }),
        createdAt: assistantCreatedAt,
      }).run();
    });

    const controller = new AbortController();
    this.jobs.set(threadId, { controller, unitName: null });
    void this.runTurn({
      threadId,
      assistantMessageId,
      userContent: content,
      controller,
    });
    return {
      accepted: true,
      duplicate: false,
      userMessageId,
      assistantMessageId,
      latestEventId: latestChatEventId(threadId),
    };
  }

  async abort(threadId: string, user: User) {
    authorizeProjectChat(threadId, user);
    const job = this.jobs.get(threadId);
    if (job) {
      job.controller.abort();
      if (job.unitName) await stopSandboxUnit(job.unitName);
      return { ok: true };
    }
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(schema.projectChatThreads).set({ status: 'ready', lastError: null, updatedAt: now })
        .where(and(
          eq(schema.projectChatThreads.id, threadId),
          eq(schema.projectChatThreads.status, 'running'),
        ))
        .run();
      tx.update(schema.projectChatMessages).set({ state: 'cancelled', updatedAt: now })
        .where(and(
          eq(schema.projectChatMessages.threadId, threadId),
          eq(schema.projectChatMessages.state, 'streaming'),
        ))
        .run();
    });
    appendProjectChatEvent(threadId, 'turn_cancelled', {});
    return { ok: true };
  }

  async stop() {
    const jobs = [...this.jobs.entries()];
    for (const [, job] of jobs) job.controller.abort();
    await Promise.allSettled(jobs.map(([, job]) => job.unitName ? stopSandboxUnit(job.unitName) : Promise.resolve()));
  }

  private async runTurn(input: {
    threadId: string;
    assistantMessageId: string;
    userContent: string;
    controller: AbortController;
  }) {
    let draft = '';
    let flushTimer: NodeJS.Timeout | null = null;
    let lastActivity: ProjectChatActivity | null = null;
    const flushDraft = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      const now = new Date().toISOString();
      db.update(schema.projectChatMessages).set({ content: draft, updatedAt: now })
        .where(eq(schema.projectChatMessages.id, input.assistantMessageId))
        .run();
      appendProjectChatEvent(input.threadId, 'message_updated', {
        messageId: input.assistantMessageId,
        content: draft,
        state: 'streaming',
      });
    };
    const scheduleDraftFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(flushDraft, DRAFT_FLUSH_MS);
      flushTimer.unref();
    };

    try {
      const thread = db.select().from(schema.projectChatThreads)
        .where(eq(schema.projectChatThreads.id, input.threadId)).get();
      if (!thread) throw new Error('chat_not_found');
      const project = db.select().from(schema.projects)
        .where(eq(schema.projects.id, thread.projectId)).get();
      if (!project) throw new Error('project_not_found');

      appendProjectChatEvent(input.threadId, 'activity', { activity: 'project', phase: 'preparing' });
      const worktree = await prepareTaskWorktree({
        projectPath: project.folderPath,
        worktreePath: appDataDir('worktrees', project.id, input.threadId, 'tree'),
        taskId: input.threadId,
        taskKey: `${project.key}-chat`,
        signal: input.controller.signal,
      });
      const agentsContext = await loadAgentsContext(worktree.projectPath);
      const workspacePath = agentsContext.path ? path.dirname(agentsContext.path) : worktree.projectPath;
      db.update(schema.projectChatThreads).set({ sourceRevision: worktree.revision })
        .where(eq(schema.projectChatThreads.id, input.threadId)).run();

      const result = await runProjectChatHarnessTurn({
        threadId: input.threadId,
        harness: thread.harness,
        reasoningEffort: thread.reasoningEffort,
        workspacePath,
        sessionRoot: appDataDir('chat-sessions', input.threadId),
        nativeSessionId: thread.nativeSessionId,
        prompt: input.userContent,
        signal: input.controller.signal,
        onText: (fragment) => {
          draft += fragment;
          scheduleDraftFlush();
        },
        onActivity: (activity) => {
          if (activity === lastActivity) return;
          lastActivity = activity;
          appendProjectChatEvent(input.threadId, 'activity', { activity, phase: 'running' });
        },
        onUnit: (unitName) => {
          const job = this.jobs.get(input.threadId);
          if (job) job.unitName = unitName;
        },
      });
      if (flushTimer) flushDraft();
      draft = result.text;
      const dirty = await worktreeIsDirty(worktree.worktreeRoot);
      if (dirty) throw new Error('chat_read_only_violation');

      const now = new Date().toISOString();
      db.transaction((tx) => {
        tx.update(schema.projectChatMessages).set({
          content: result.text,
          state: 'complete',
          updatedAt: now,
        }).where(eq(schema.projectChatMessages.id, input.assistantMessageId)).run();
        tx.update(schema.projectChatThreads).set({
          status: 'ready',
          nativeSessionId: result.nativeSessionId,
          lastError: null,
          updatedAt: now,
        }).where(eq(schema.projectChatThreads.id, input.threadId)).run();
        tx.insert(schema.projectChatEvents).values({
          threadId: input.threadId,
          type: 'message_completed',
          payload: JSON.stringify({
            messageId: input.assistantMessageId,
            content: result.text,
            state: 'complete',
          }),
          createdAt: now,
        }).run();
      });
    } catch (error) {
      if (flushTimer) flushDraft();
      const cancelled = input.controller.signal.aborted || errorMessage(error).includes('cancelled');
      const errorCode = cancelled ? null : publicChatError(error);
      const now = new Date().toISOString();
      db.transaction((tx) => {
        tx.update(schema.projectChatMessages).set({
          content: draft,
          state: cancelled ? 'cancelled' : 'failed',
          updatedAt: now,
        }).where(eq(schema.projectChatMessages.id, input.assistantMessageId)).run();
        tx.update(schema.projectChatThreads).set({
          status: cancelled ? 'ready' : 'failed',
          lastError: errorCode,
          updatedAt: now,
        }).where(eq(schema.projectChatThreads.id, input.threadId)).run();
        tx.insert(schema.projectChatEvents).values({
          threadId: input.threadId,
          type: cancelled ? 'turn_cancelled' : 'error',
          payload: JSON.stringify(cancelled
            ? { messageId: input.assistantMessageId }
            : { messageId: input.assistantMessageId, code: errorCode }),
          createdAt: now,
        }).run();
      });
      if (!cancelled) {
        runtimeLogger.warn('project chat turn failed', {
          thread_id: input.threadId,
          error: errorCode,
        });
      }
    } finally {
      this.jobs.delete(input.threadId);
    }
  }
}

export function turnMessageTimestamps(now = Date.now()) {
  return {
    userCreatedAt: new Date(now).toISOString(),
    assistantCreatedAt: new Date(now + 1).toISOString(),
  };
}

async function worktreeIsDirty(worktreeRoot: string) {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: worktreeRoot,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return Boolean(stdout.trim());
}

function conversationTitle(value: string) {
  const firstLine = value.split(/\r?\n/, 1)[0]!.replace(/\s+/g, ' ').trim();
  return firstLine.length <= 72 ? firstLine : `${firstLine.slice(0, 69).trimEnd()}…`;
}

function publicChatError(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('read_only_violation')) return 'chat_read_only_violation';
  if (message.includes('executable_not_found') || message.includes('ENOENT')) return 'chat_harness_unavailable';
  if (message.includes('empty_response')) return 'chat_empty_response';
  if (message.includes('worktree')) return 'chat_workspace_failed';
  return 'chat_harness_failed';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
