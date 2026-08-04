import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, max, notInArray, sql } from 'drizzle-orm';
import { createError } from 'h3';
import { appDataDir, db, schema } from './db';
import { removeTaskWorktree } from './git-workspaces';
import { hashPassword } from './security/password';
import { activeTaskDescription, publicTaskDescription, type TaskDescriptionSource } from './task-description';
import type { User } from './db/schema';

const DEFAULT_COLUMNS = [
  { key: 'backlog', nameEn: 'Backlog', nameDe: 'Backlog', position: 0, done: false },
  { key: 'todo', nameEn: 'To Do', nameDe: 'Zu erledigen', position: 1, done: false },
  { key: 'in_progress', nameEn: 'In Progress', nameDe: 'In Bearbeitung', position: 2, done: false },
  { key: 'in_review', nameEn: 'In Review', nameDe: 'In Prüfung', position: 3, done: false },
  { key: 'done', nameEn: 'Done', nameDe: 'Erledigt', position: 4, done: true },
];

export async function createProject(input: {
  name: string;
  key: string;
  description?: string | null;
  folderPath: string;
  userIds?: string[];
  tags?: string[];
}, admin: User) {
  const now = new Date().toISOString();
  const folderPath = path.resolve(input.folderPath);
  await fs.mkdir(folderPath, { recursive: true });

  const projectId = randomUUID();
  const oberthemaId = randomUUID();
  const unterthemaId = randomUUID();
  db.transaction((tx) => {
    tx.insert(schema.projects).values({
      id: projectId,
      key: normalizeProjectKey(input.key),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      folderPath,
      createdBy: admin.id,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(schema.projectUsers).values({
      projectId,
      userId: admin.id,
      role: 'member',
      createdAt: now,
    }).onConflictDoNothing().run();

    for (const userId of input.userIds ?? []) {
      tx.insert(schema.projectUsers).values({
        projectId,
        userId,
        role: 'member',
        createdAt: now,
      }).onConflictDoNothing().run();
    }

    for (const tag of normalizeTags(input.tags ?? [])) {
      tx.insert(schema.projectTags).values({
        projectId,
        name: tag,
        createdAt: now,
      }).onConflictDoNothing().run();
    }

    for (const column of DEFAULT_COLUMNS) {
      tx.insert(schema.columns).values({
        id: randomUUID(),
        projectId,
        ...column,
        createdAt: now,
      }).run();
    }

    tx.insert(schema.oberthemen).values({
      id: oberthemaId,
      projectId,
      name: 'Allgemein',
      description: 'Übergreifende Projektarbeit',
      color: 'teal',
      position: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(schema.unterthemen).values({
      id: unterthemaId,
      oberthemaId,
      name: 'Allgemeine Aufgaben',
      description: 'Neue Aufgaben ohne spezifisches Unterthema',
      position: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(schema.swimlanes).values({
      id: randomUUID(),
      projectId,
      nameEn: 'General',
      nameDe: 'Allgemein',
      position: 0,
      createdAt: now,
    }).run();
  });

  return getProject(projectId, admin);
}

export async function updateProject(projectId: string, input: {
  name?: string;
  key?: string;
  description?: string | null;
  folderPath?: string;
  userIds?: string[];
  tags?: string[];
}, admin: User) {
  getProject(projectId, admin);
  const updates: Partial<typeof schema.projects.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.key !== undefined) updates.key = normalizeProjectKey(input.key);
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.folderPath !== undefined) {
    const folderPath = path.resolve(input.folderPath);
    await fs.mkdir(folderPath, { recursive: true });
    updates.folderPath = folderPath;
  }

  db.transaction((tx) => {
    tx.update(schema.projects).set(updates).where(eq(schema.projects.id, projectId)).run();
    if (input.userIds) {
      tx.delete(schema.projectUsers).where(eq(schema.projectUsers.projectId, projectId)).run();
      const memberIds = [...new Set([admin.id, ...input.userIds])];
      for (const userId of memberIds) {
        tx.insert(schema.projectUsers).values({
          projectId,
          userId,
          role: 'member',
          createdAt: new Date().toISOString(),
        }).onConflictDoNothing().run();
      }
      tx.update(schema.tasks).set({ assigneeId: null, updatedAt: updates.updatedAt! })
        .where(and(eq(schema.tasks.projectId, projectId), notInArray(schema.tasks.assigneeId, memberIds)))
        .run();
    }
  });
  if (input.tags) {
    setProjectTags(projectId, input.tags);
  }

  return getProject(projectId, admin);
}

export function listProjects(user: User) {
  if (user.role === 'admin') {
    return db.select().from(schema.projects).orderBy(asc(schema.projects.name)).all();
  }
  const rows = db
    .select({ project: schema.projects })
    .from(schema.projectUsers)
    .innerJoin(schema.projects, eq(schema.projectUsers.projectId, schema.projects.id))
    .where(eq(schema.projectUsers.userId, user.id))
    .orderBy(asc(schema.projects.name))
    .all();
  return rows.map((row) => row.project);
}

export function getProject(projectId: string, user: User) {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw createError({ statusCode: 404, statusMessage: 'project_not_found' });
  if (user.role !== 'admin') {
    const membership = db.select().from(schema.projectUsers)
      .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, user.id)))
      .get();
    if (!membership) throw createError({ statusCode: 403, statusMessage: 'project_forbidden' });
  }
  return project;
}

export function getBoard(projectId: string, user: User) {
  const project = getProject(projectId, user);
  const projectColumns = db.select().from(schema.columns)
    .where(eq(schema.columns.projectId, projectId))
    .orderBy(asc(schema.columns.position))
    .all();
  const lanes = db.select().from(schema.swimlanes)
    .where(eq(schema.swimlanes.projectId, projectId))
    .orderBy(asc(schema.swimlanes.position))
    .all();
  const topics = db.select().from(schema.oberthemen)
    .where(eq(schema.oberthemen.projectId, projectId))
    .orderBy(asc(schema.oberthemen.position), asc(schema.oberthemen.createdAt))
    .all();
  const topicIds = topics.map((topic) => topic.id);
  const subtopics = topicIds.length
    ? db.select().from(schema.unterthemen)
      .where(inArray(schema.unterthemen.oberthemaId, topicIds))
      .orderBy(asc(schema.unterthemen.position), asc(schema.unterthemen.createdAt))
      .all()
    : [];
  const taskRows = db.select().from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .orderBy(asc(schema.tasks.position), desc(schema.tasks.createdAt))
    .all();
  const taskIds = taskRows.map((task) => task.id);
  const taskAttachments = taskIds.length
    ? db.select().from(schema.attachments).where(inArray(schema.attachments.taskId, taskIds)).all()
    : [];
  const attachmentIds = taskAttachments.map((attachment) => attachment.id);
  const annotations = attachmentIds.length
    ? db.select().from(schema.attachmentAnnotations).where(inArray(schema.attachmentAnnotations.attachmentId, attachmentIds)).all()
    : [];
  const taskTags = taskIds.length
    ? db.select().from(schema.taskTags).where(inArray(schema.taskTags.taskId, taskIds)).orderBy(asc(schema.taskTags.name)).all()
    : [];
  const unreadMentionRows = taskIds.length
    ? db.select({
      taskId: schema.commentMentions.taskId,
      count: count(),
      latestAt: max(schema.commentMentions.createdAt),
    })
      .from(schema.commentMentions)
      .where(and(
        inArray(schema.commentMentions.taskId, taskIds),
        eq(schema.commentMentions.userId, user.id),
        isNull(schema.commentMentions.seenAt),
      ))
      .groupBy(schema.commentMentions.taskId)
      .all()
    : [];
  const unreadMentionsByTaskId = new Map(unreadMentionRows.map((row) => [row.taskId, row]));
  const projectTags = getProjectTags(projectId);
  const members = db.select({ user: schema.users })
    .from(schema.projectUsers)
    .innerJoin(schema.users, eq(schema.projectUsers.userId, schema.users.id))
    .where(eq(schema.projectUsers.projectId, projectId))
    .orderBy(asc(schema.users.name))
    .all()
    .map((row) => ({ id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role }));

  return {
    project,
    projectTags,
    columns: projectColumns,
    oberthemen: topics,
    unterthemen: subtopics,
    swimlanes: lanes,
    members,
    tasks: taskRows.map((task) => ({
      ...publicTaskDescription(task),
      attachments: taskAttachments
        .filter((attachment) => attachment.taskId === task.id)
        .map((attachment) => decorateAttachment(attachment, annotations.find((annotation) => annotation.attachmentId === attachment.id))),
      tags: taskTags.filter((tag) => tag.taskId === task.id).map((tag) => tag.name),
      unreadMentionCount: unreadMentionsByTaskId.get(task.id)?.count ?? 0,
      latestUnreadMentionAt: unreadMentionsByTaskId.get(task.id)?.latestAt ?? null,
    })),
  };
}

export function getCommandPaletteIndex(user: User) {
  const projects = listProjects(user);
  if (!projects.length) return { tasks: [], topics: [] };

  const projectIds = projects.map((project) => project.id);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const columns = db.select().from(schema.columns)
    .where(inArray(schema.columns.projectId, projectIds))
    .orderBy(asc(schema.columns.position))
    .all();
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const oberthemen = db.select().from(schema.oberthemen)
    .where(inArray(schema.oberthemen.projectId, projectIds))
    .orderBy(asc(schema.oberthemen.position), asc(schema.oberthemen.createdAt))
    .all();
  const oberthemaById = new Map(oberthemen.map((topic) => [topic.id, topic]));
  const unterthemen = db.select({
    unterthema: schema.unterthemen,
    projectId: schema.oberthemen.projectId,
  })
    .from(schema.unterthemen)
    .innerJoin(schema.oberthemen, eq(schema.unterthemen.oberthemaId, schema.oberthemen.id))
    .where(inArray(schema.oberthemen.projectId, projectIds))
    .orderBy(asc(schema.unterthemen.position), asc(schema.unterthemen.createdAt))
    .all();
  const unterthemaById = new Map(unterthemen.map((row) => [row.unterthema.id, row.unterthema]));
  const taskRows = db.select({
    task: schema.tasks,
    assigneeName: schema.users.name,
    assigneeEmail: schema.users.email,
  })
    .from(schema.tasks)
    .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
    .where(inArray(schema.tasks.projectId, projectIds))
    .orderBy(desc(schema.tasks.updatedAt), asc(schema.tasks.key))
    .all();
  const taskTagRows = db.select({
    taskId: schema.taskTags.taskId,
    name: schema.taskTags.name,
  })
    .from(schema.taskTags)
    .innerJoin(schema.tasks, eq(schema.taskTags.taskId, schema.tasks.id))
    .where(inArray(schema.tasks.projectId, projectIds))
    .orderBy(asc(schema.taskTags.name))
    .all();
  const tagsByTaskId = new Map<string, string[]>();
  for (const row of taskTagRows) {
    const tags = tagsByTaskId.get(row.taskId) ?? [];
    tags.push(row.name);
    tagsByTaskId.set(row.taskId, tags);
  }

  return {
    tasks: taskRows.map(({ task, assigneeName, assigneeEmail }) => {
      const project = projectById.get(task.projectId)!;
      const column = columnById.get(task.columnId);
      const oberthema = oberthemaById.get(task.oberthemaId);
      const unterthema = task.unterthemaId ? unterthemaById.get(task.unterthemaId) : undefined;
      return {
        id: task.id,
        projectId: project.id,
        projectKey: project.key,
        projectName: project.name,
        key: task.key,
        title: task.title,
        description: activeTaskDescription(task),
        priority: task.priority,
        columnId: task.columnId,
        columnKey: column?.key ?? null,
        columnNameEn: column?.nameEn ?? null,
        columnNameDe: column?.nameDe ?? null,
        columnDone: column?.done ?? false,
        oberthemaId: task.oberthemaId,
        oberthemaName: oberthema?.name ?? null,
        unterthemaId: task.unterthemaId,
        unterthemaName: unterthema?.name ?? null,
        assigneeId: task.assigneeId,
        assigneeName,
        assigneeEmail,
        agentEnabled: task.agentEnabled,
        agentStatus: task.agentStatus,
        tags: tagsByTaskId.get(task.id) ?? [],
        updatedAt: task.updatedAt,
      };
    }),
    topics: [
      ...oberthemen.map((topic) => {
        const project = projectById.get(topic.projectId)!;
        return {
          id: topic.id,
          kind: 'oberthema' as const,
          name: topic.name,
          description: topic.description,
          projectId: project.id,
          projectKey: project.key,
          projectName: project.name,
          oberthemaId: topic.id,
          oberthemaName: topic.name,
          updatedAt: topic.updatedAt,
        };
      }),
      ...unterthemen.map(({ unterthema, projectId }) => {
        const project = projectById.get(projectId)!;
        const oberthema = oberthemaById.get(unterthema.oberthemaId)!;
        return {
          id: unterthema.id,
          kind: 'unterthema' as const,
          name: unterthema.name,
          description: unterthema.description,
          projectId: project.id,
          projectKey: project.key,
          projectName: project.name,
          oberthemaId: oberthema.id,
          oberthemaName: oberthema.name,
          updatedAt: unterthema.updatedAt,
        };
      }),
    ],
  };
}

export function getTaskDetail(taskId: string, user: User) {
  const { task, project } = authorizeTaskAccess(taskId, user);
  const attachments = db.select().from(schema.attachments)
    .where(eq(schema.attachments.taskId, taskId))
    .orderBy(asc(schema.attachments.createdAt))
    .all();
  const annotations = attachments.length
    ? db.select().from(schema.attachmentAnnotations).where(inArray(schema.attachmentAnnotations.attachmentId, attachments.map((attachment) => attachment.id))).all()
    : [];
  const tags = db.select().from(schema.taskTags)
    .where(eq(schema.taskTags.taskId, taskId))
    .orderBy(asc(schema.taskTags.name))
    .all()
    .map((tag) => tag.name);
  const comments = db.select({
    id: schema.comments.id,
    taskId: schema.comments.taskId,
    userId: schema.comments.userId,
    kind: schema.comments.kind,
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    userName: schema.users.name,
  })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.taskId, taskId))
    .orderBy(asc(schema.comments.createdAt))
    .all();
  const commentMentions = db.select({
    commentId: schema.commentMentions.commentId,
    userId: schema.commentMentions.userId,
    userName: schema.users.name,
    seenAt: schema.commentMentions.seenAt,
  })
    .from(schema.commentMentions)
    .innerJoin(schema.users, eq(schema.commentMentions.userId, schema.users.id))
    .where(eq(schema.commentMentions.taskId, taskId))
    .orderBy(asc(schema.commentMentions.createdAt), asc(schema.users.name))
    .all();
  const mentionsByCommentId = new Map<string, typeof commentMentions>();
  for (const mention of commentMentions) {
    const mentions = mentionsByCommentId.get(mention.commentId) ?? [];
    mentions.push(mention);
    mentionsByCommentId.set(mention.commentId, mentions);
  }
  const events = db.select().from(schema.activity)
    .where(and(
      eq(schema.activity.taskId, taskId),
      notInArray(schema.activity.action, ['codex_event']),
    ))
    .orderBy(asc(schema.activity.createdAt))
    .all();

  return {
    project,
    projectTags: getProjectTags(project.id),
    hierarchy: getTaskHierarchy(task.oberthemaId, task.unterthemaId),
    task: {
      ...publicTaskDescription(task),
      attachments: attachments.map((attachment) => decorateAttachment(attachment, annotations.find((annotation) => annotation.attachmentId === attachment.id))),
      tags,
    },
    comments: comments.map((comment) => {
      const mentions = mentionsByCommentId.get(comment.id) ?? [];
      const currentUserMention = mentions.find((mention) => mention.userId === user.id);
      return {
        ...comment,
        mentions: mentions.map(({ userId, userName }) => ({ userId, userName })),
        mentionedCurrentUser: Boolean(currentUserMention),
        unreadMention: Boolean(currentUserMention && !currentUserMention.seenAt),
      };
    }),
    unreadMentionCount: commentMentions.filter((mention) => mention.userId === user.id && !mention.seenAt).length,
    events,
  };
}

export function authorizeTaskAccess(taskId: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  return { task, project: getProject(task.projectId, user) };
}

export async function createSwimlane(projectId: string, input: { nameEn: string; nameDe?: string }, user: User) {
  getProject(projectId, user);
  const currentMax = db.select({ value: max(schema.swimlanes.position) }).from(schema.swimlanes)
    .where(eq(schema.swimlanes.projectId, projectId))
    .get()?.value ?? 0;
  const now = new Date().toISOString();
  const lane = {
    id: randomUUID(),
    projectId,
    nameEn: input.nameEn.trim(),
    nameDe: (input.nameDe ?? input.nameEn).trim(),
    position: currentMax + 1,
    createdAt: now,
  };
  db.insert(schema.swimlanes).values(lane).run();
  return lane;
}

export function createOberthema(projectId: string, input: TopicInput, user: User) {
  getProject(projectId, user);
  const name = input.name.trim();
  ensureOberthemaNameAvailable(projectId, name);
  const now = new Date().toISOString();
  const currentMax = db.select({ value: max(schema.oberthemen.position) }).from(schema.oberthemen)
    .where(eq(schema.oberthemen.projectId, projectId))
    .get()?.value ?? -1;
  const topic = {
    id: randomUUID(),
    projectId,
    name,
    description: input.description?.trim() || null,
    color: input.color ?? 'teal',
    position: input.position ?? currentMax + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.oberthemen).values(topic).run();
  logTaskActivity(projectId, null, user.id, 'oberthema_created', { oberthemaId: topic.id, name: topic.name });
  return topic;
}

export function updateOberthema(oberthemaId: string, input: Partial<TopicInput>, user: User) {
  const topic = requireOberthema(oberthemaId, user);
  const name = input.name?.trim();
  if (name) ensureOberthemaNameAvailable(topic.projectId, name, topic.id);
  db.update(schema.oberthemen).set({
    name: name || undefined,
    description: input.description === undefined ? undefined : input.description?.trim() || null,
    color: input.color,
    position: input.position,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.oberthemen.id, oberthemaId)).run();
  const updated = db.select().from(schema.oberthemen).where(eq(schema.oberthemen.id, topic.id)).get();
  logTaskActivity(topic.projectId, null, user.id, 'oberthema_updated', { oberthemaId, name: updated?.name });
  return updated;
}

export function deleteOberthema(oberthemaId: string, user: User) {
  const topic = requireOberthema(oberthemaId, user);
  const taskCount = db.select({ value: count() }).from(schema.tasks)
    .where(eq(schema.tasks.oberthemaId, oberthemaId)).get()?.value ?? 0;
  if (taskCount > 0) throw createError({ statusCode: 409, statusMessage: 'oberthema_not_empty' });
  logTaskActivity(topic.projectId, null, user.id, 'oberthema_deleted', { oberthemaId, name: topic.name });
  db.delete(schema.oberthemen).where(eq(schema.oberthemen.id, oberthemaId)).run();
  return { ok: true, projectId: topic.projectId };
}

export function createUnterthema(oberthemaId: string, input: SubtopicInput, user: User) {
  const topic = requireOberthema(oberthemaId, user);
  const name = input.name.trim();
  ensureUnterthemaNameAvailable(oberthemaId, name);
  const now = new Date().toISOString();
  const currentMax = db.select({ value: max(schema.unterthemen.position) }).from(schema.unterthemen)
    .where(eq(schema.unterthemen.oberthemaId, oberthemaId))
    .get()?.value ?? -1;
  const subtopic = {
    id: randomUUID(),
    oberthemaId,
    name,
    description: input.description?.trim() || null,
    position: input.position ?? currentMax + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.unterthemen).values(subtopic).run();
  logTaskActivity(topic.projectId, null, user.id, 'unterthema_created', {
    oberthemaId,
    unterthemaId: subtopic.id,
    name: subtopic.name,
  });
  return subtopic;
}

export function updateUnterthema(unterthemaId: string, input: Partial<SubtopicInput> & { oberthemaId?: string }, user: User) {
  const { subtopic, topic } = requireUnterthema(unterthemaId, user);
  const targetTopic = input.oberthemaId ? requireOberthema(input.oberthemaId, user) : topic;
  if (targetTopic.projectId !== topic.projectId) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_oberthema' });
  }
  const name = input.name?.trim() || subtopic.name;
  ensureUnterthemaNameAvailable(targetTopic.id, name, subtopic.id);
  db.transaction((tx) => {
    tx.update(schema.unterthemen).set({
      oberthemaId: targetTopic.id,
      name,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      position: input.position,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.unterthemen.id, unterthemaId)).run();
    if (targetTopic.id !== topic.id) {
      tx.update(schema.tasks).set({
        oberthemaId: targetTopic.id,
      }).where(eq(schema.tasks.unterthemaId, unterthemaId)).run();
    }
  });
  const updated = db.select().from(schema.unterthemen).where(eq(schema.unterthemen.id, subtopic.id)).get();
  logTaskActivity(topic.projectId, null, user.id, 'unterthema_updated', {
    oberthemaId: targetTopic.id,
    unterthemaId,
    name: updated?.name,
  });
  return updated;
}

export function deleteUnterthema(unterthemaId: string, user: User) {
  const { subtopic, topic } = requireUnterthema(unterthemaId, user);
  const taskCount = db.select({ value: count() }).from(schema.tasks)
    .where(eq(schema.tasks.unterthemaId, unterthemaId)).get()?.value ?? 0;
  if (taskCount > 0) throw createError({ statusCode: 409, statusMessage: 'unterthema_not_empty' });
  logTaskActivity(topic.projectId, null, user.id, 'unterthema_deleted', {
    oberthemaId: subtopic.oberthemaId,
    unterthemaId,
    name: subtopic.name,
  });
  db.delete(schema.unterthemen).where(eq(schema.unterthemen.id, unterthemaId)).run();
  return { ok: true, projectId: topic.projectId, oberthemaId: subtopic.oberthemaId };
}

export function reorderHierarchy(projectId: string, input: {
  oberthemaIds: string[];
  unterthemen: Array<{ oberthemaId: string; ids: string[] }>;
}, user: User) {
  getProject(projectId, user);
  const topics = db.select().from(schema.oberthemen)
    .where(eq(schema.oberthemen.projectId, projectId))
    .all();
  const topicIds = new Set(topics.map((topic) => topic.id));
  const subtopics = topics.length
    ? db.select().from(schema.unterthemen)
      .where(inArray(schema.unterthemen.oberthemaId, [...topicIds]))
      .all()
    : [];
  const subtopicIds = new Set(subtopics.map((subtopic) => subtopic.id));
  const orderedTopicIds = new Set(input.oberthemaIds);
  const groupTopicIds = new Set(input.unterthemen.map((group) => group.oberthemaId));
  const orderedSubtopicIds = input.unterthemen.flatMap((group) => group.ids);
  const uniqueOrderedSubtopicIds = new Set(orderedSubtopicIds);

  const validTopics = input.oberthemaIds.length === topics.length
    && orderedTopicIds.size === topics.length
    && [...orderedTopicIds].every((id) => topicIds.has(id));
  const validGroups = input.unterthemen.length === topics.length
    && groupTopicIds.size === topics.length
    && [...groupTopicIds].every((id) => topicIds.has(id));
  const validSubtopics = orderedSubtopicIds.length === subtopics.length
    && uniqueOrderedSubtopicIds.size === subtopics.length
    && [...uniqueOrderedSubtopicIds].every((id) => subtopicIds.has(id));
  if (!validTopics || !validGroups || !validSubtopics) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_hierarchy_order' });
  }

  const currentParents = new Map(subtopics.map((subtopic) => [subtopic.id, subtopic.oberthemaId]));
  const now = new Date().toISOString();
  db.transaction((tx) => {
    input.oberthemaIds.forEach((id, index) => {
      tx.update(schema.oberthemen).set({ position: index * 1000, updatedAt: now })
        .where(eq(schema.oberthemen.id, id)).run();
    });
    input.unterthemen.forEach((group) => {
      group.ids.forEach((id, index) => {
        tx.update(schema.unterthemen).set({
          oberthemaId: group.oberthemaId,
          position: index * 1000,
          updatedAt: now,
        }).where(eq(schema.unterthemen.id, id)).run();
        if (currentParents.get(id) !== group.oberthemaId) {
          tx.update(schema.tasks).set({ oberthemaId: group.oberthemaId })
            .where(eq(schema.tasks.unterthemaId, id)).run();
        }
      });
    });
  });
  logTaskActivity(projectId, null, user.id, 'hierarchy_reordered', {
    oberthemaIds: input.oberthemaIds,
    unterthemen: input.unterthemen,
  });
  return getBoard(projectId, user);
}

type CreateTaskInput = {
  title: string;
  description?: string | null;
  columnId?: string | null;
  swimlaneId?: string | null;
  oberthemaId?: string | null;
  unterthemaId?: string | null;
  assigneeId?: string | null;
  agentEnabled?: boolean;
  clientRequestId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  files?: UploadedTaskFile[];
};

type BoardTask = ReturnType<typeof getBoard>['tasks'][number];

const TASK_CREATION_WAIT_MS = 5_000;
const TASK_CREATION_STALE_MS = 2 * 60_000;
const inFlightTaskCreations = new Map<string, Promise<BoardTask>>();

export async function createTask(projectId: string, input: CreateTaskInput, user: User) {
  const project = getProject(projectId, user);
  const clientRequestId = input.clientRequestId;
  if (!clientRequestId) return createTaskOnce(projectId, input, user, project);
  const idempotentInput = { ...input, clientRequestId };

  const requestKey = `${projectId}:${user.id}:${clientRequestId}`;
  const activeCreation = inFlightTaskCreations.get(requestKey);
  if (activeCreation) return activeCreation;

  const creation = createTaskIdempotently(projectId, idempotentInput, user, project);
  inFlightTaskCreations.set(requestKey, creation);
  void creation.then(
    () => clearInFlightTaskCreation(requestKey, creation),
    () => clearInFlightTaskCreation(requestKey, creation),
  );
  return creation;
}

async function createTaskIdempotently(
  projectId: string,
  input: CreateTaskInput & { clientRequestId: string },
  user: User,
  project: ReturnType<typeof getProject>,
) {
  const existingTask = findTaskByClientRequest(projectId, user.id, input.clientRequestId);
  if (existingTask) {
    if (isTaskCreationComplete(existingTask.id)) {
      return getBoardTask(projectId, existingTask.id, user);
    }

    if (!isTaskCreationStale(existingTask.createdAt)) {
      // A second Node process may still be finishing its local file writes.
      // Wait briefly, but never delete a fresh creation owned by that process.
      const completedTask = await waitForCompletedTaskCreation(projectId, existingTask.id, user);
      if (completedTask) return completedTask;
      if (completedTask === undefined) {
        throw createError({ statusCode: 409, statusMessage: 'task_creation_in_progress' });
      }
    } else {
      // A server crash can leave an old task row behind before the completion
      // marker was written. Only an explicitly stale request may be reclaimed.
      await rollbackCreatedTask(existingTask.id);
    }
  }

  return createTaskOnce(projectId, input, user, project);
}

async function createTaskOnce(
  projectId: string,
  input: CreateTaskInput,
  user: User,
  project: ReturnType<typeof getProject>,
): Promise<BoardTask> {
  const assigneeId = resolveTaskAssignee(projectId, input.assigneeId, user.id);
  const now = new Date().toISOString();
  const columnId = defaultBacklogColumn(projectId);
  const column = getProjectColumn(projectId, columnId);
  const placement = resolveTaskPlacement(projectId, input.oberthemaId, input.unterthemaId, user);
  const position = nextTaskPosition(projectId, columnId, placement.oberthemaId, placement.unterthemaId);
  const taskId = randomUUID();
  const taskKey = nextTaskKey(project.key);

  let inserted = false;
  try {
    db.insert(schema.tasks).values({
      id: taskId,
      projectId,
      oberthemaId: placement.oberthemaId,
      unterthemaId: placement.unterthemaId,
      columnId,
      swimlaneId: input.swimlaneId || null,
      key: taskKey,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? 'normal',
      position,
      createdBy: user.id,
      clientRequestId: input.clientRequestId || null,
      assigneeId,
      agentEnabled: input.agentEnabled ?? false,
      agentStatus: 'idle',
      createdAt: now,
      updatedAt: now,
    }).run();
    inserted = true;

    if (input.tags?.length) {
      setTaskTags(taskId, input.tags, projectId);
    }

    for (const file of input.files ?? []) {
      const attachmentId = await storeTaskAttachment(taskId, file, user.id);
      if (file.annotation) {
        await saveAttachmentAnnotation(taskId, attachmentId, {
          annotationData: file.annotation.data,
          renderedImage: file.annotation.renderedImage,
        }, user);
      }
    }
    logTaskActivity(projectId, taskId, user.id, 'task_created', { columnKey: column.key, tags: normalizeTags(input.tags ?? []) });

    return getBoardTask(projectId, taskId, user);
  } catch (error) {
    if (inserted) {
      await rollbackCreatedTask(taskId);
    } else if (input.clientRequestId) {
      const duplicate = findTaskByClientRequest(projectId, user.id, input.clientRequestId);
      if (duplicate) {
        const completedTask = await waitForCompletedTaskCreation(projectId, duplicate.id, user);
        if (completedTask) return completedTask;
        if (completedTask === null) return createTaskOnce(projectId, input, user, project);
        throw createError({ statusCode: 409, statusMessage: 'task_creation_in_progress' });
      }
    }
    throw error;
  }
}

function clearInFlightTaskCreation(requestKey: string, creation: Promise<BoardTask>) {
  if (inFlightTaskCreations.get(requestKey) === creation) inFlightTaskCreations.delete(requestKey);
}

function findTaskByClientRequest(projectId: string, userId: string, clientRequestId: string) {
  return db.select({ id: schema.tasks.id, createdAt: schema.tasks.createdAt }).from(schema.tasks).where(and(
    eq(schema.tasks.projectId, projectId),
    eq(schema.tasks.createdBy, userId),
    eq(schema.tasks.clientRequestId, clientRequestId),
  )).get();
}

function isTaskCreationComplete(taskId: string) {
  return Boolean(db.select({ id: schema.activity.id }).from(schema.activity).where(and(
    eq(schema.activity.taskId, taskId),
    eq(schema.activity.action, 'task_created'),
  )).get());
}

function getBoardTask(projectId: string, taskId: string, user: User) {
  const task = getBoard(projectId, user).tasks.find((item) => item.id === taskId);
  if (!task) throw createError({ statusCode: 500, statusMessage: 'created_task_not_found' });
  return task;
}

async function waitForCompletedTaskCreation(projectId: string, taskId: string, user: User) {
  const deadline = Date.now() + TASK_CREATION_WAIT_MS;
  while (Date.now() < deadline) {
    if (isTaskCreationComplete(taskId)) return getBoardTask(projectId, taskId, user);
    const taskStillExists = db.select({ id: schema.tasks.id }).from(schema.tasks)
      .where(eq(schema.tasks.id, taskId)).get();
    if (!taskStillExists) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

function isTaskCreationStale(createdAt: string) {
  const createdAtMs = Date.parse(createdAt);
  return !Number.isFinite(createdAtMs) || Date.now() - createdAtMs >= TASK_CREATION_STALE_MS;
}

export async function updateTask(taskId: string, input: {
  title?: string;
  description?: string | null;
  descriptionSource?: TaskDescriptionSource;
  columnId?: string;
  swimlaneId?: string | null;
  oberthemaId?: string;
  unterthemaId?: string | null;
  assigneeId?: string | null;
  agentEnabled?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  position?: number;
  agentStatus?: 'idle' | 'queued' | 'running' | 'failed' | 'done';
}, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  const project = getProject(task.projectId, user);
  const currentColumn = getProjectColumn(task.projectId, task.columnId);
  let targetColumn = currentColumn;
  if ((task.agentStatus === 'running' || task.agentStatus === 'done' || task.agentStatus === 'failed')
    && (input.title !== undefined || input.description !== undefined || input.descriptionSource !== undefined)) {
    throw createError({ statusCode: 409, statusMessage: 'task_locked_after_agent_start' });
  }
  if (input.descriptionSource === 'refined' && !task.refinedDescription?.trim()) {
    throw createError({ statusCode: 409, statusMessage: 'refined_description_missing' });
  }
  if (task.agentStatus === 'running' && input.agentEnabled !== undefined && input.agentEnabled !== task.agentEnabled) {
    throw createError({ statusCode: 409, statusMessage: 'task_running_agent_mode_locked' });
  }
  const nextAssigneeId = input.assigneeId === undefined
    ? undefined
    : resolveTaskAssignee(task.projectId, input.assigneeId, user.id, false);

  let nextAgentStatus = input.agentStatus;
  const nextAgentEnabled = input.agentEnabled ?? task.agentEnabled;
  const placementRequested = input.oberthemaId !== undefined || input.unterthemaId !== undefined;
  const nextPlacement = placementRequested
    ? resolveTaskPlacement(
      task.projectId,
      input.oberthemaId !== undefined
        ? input.oberthemaId
        : input.unterthemaId
          ? undefined
          : task.oberthemaId,
      input.unterthemaId === undefined ? task.unterthemaId : input.unterthemaId,
      user,
    )
    : { oberthemaId: task.oberthemaId, unterthemaId: task.unterthemaId };
  const placementChanged = nextPlacement.oberthemaId !== task.oberthemaId
    || nextPlacement.unterthemaId !== task.unterthemaId;
  if (input.columnId) {
    targetColumn = getProjectColumn(task.projectId, input.columnId);
    if (targetColumn.key === 'todo' && nextAgentEnabled && task.agentStatus !== 'running') {
      nextAgentStatus = 'queued';
    } else if (task.agentStatus === 'queued' && targetColumn.key !== 'todo') {
      nextAgentStatus = 'idle';
    }
  }
  if (input.agentEnabled !== undefined) {
    const currentColumn = getProjectColumn(task.projectId, input.columnId ?? task.columnId);
    if (!nextAgentEnabled && task.agentStatus === 'queued') nextAgentStatus = 'idle';
    if (nextAgentEnabled && currentColumn.key === 'todo' && task.agentStatus !== 'running') nextAgentStatus = 'queued';
  }
  if (!nextAgentEnabled && nextAgentStatus === 'queued') nextAgentStatus = 'idle';

  db.update(schema.tasks).set({
    title: input.title?.trim() || undefined,
    description: input.description === undefined ? undefined : input.description?.trim() || null,
    descriptionSource: input.descriptionSource,
    columnId: input.columnId,
    oberthemaId: placementRequested ? nextPlacement.oberthemaId : undefined,
    unterthemaId: placementRequested ? nextPlacement.unterthemaId : undefined,
    swimlaneId: input.swimlaneId === undefined ? undefined : input.swimlaneId,
    assigneeId: nextAssigneeId,
    agentEnabled: input.agentEnabled,
    priority: input.priority,
    position: input.position ?? (placementChanged
      ? nextTaskPosition(
        task.projectId,
        input.columnId ?? task.columnId,
        nextPlacement.oberthemaId,
        nextPlacement.unterthemaId,
      )
      : undefined),
    agentStatus: nextAgentStatus,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.tasks.id, taskId)).run();

  if (input.tags !== undefined) {
    setTaskTags(taskId, input.tags, task.projectId);
  }

  const updated = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  logTaskActivity(task.projectId, taskId, user.id, 'task_updated', {
    columnChanged: input.columnId !== undefined,
    hierarchyChanged: placementChanged,
    tagsChanged: input.tags !== undefined,
    descriptionSourceChanged: input.descriptionSource !== undefined && input.descriptionSource !== task.descriptionSource,
    agentModeChanged: input.agentEnabled !== undefined && input.agentEnabled !== task.agentEnabled,
    assigneeChanged: input.assigneeId !== undefined && nextAssigneeId !== task.assigneeId,
    agentStatus: nextAgentStatus,
  });
  if (nextAgentStatus === 'queued' && task.agentStatus !== 'queued') {
    logTaskActivity(task.projectId, taskId, user.id, 'codex_queued', { reason: 'moved_to_todo' });
  }
  if (!currentColumn.done && targetColumn.done && (task.agentEnabled || ['done', 'failed'].includes(task.agentStatus))) {
    await cleanupCompletedTaskWorktree(task, project.folderPath, user.id);
  }
  return updated ? publicTaskDescription(updated) : updated;
}

export async function deleteTask(taskId: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  if (task.agentStatus === 'running') {
    throw createError({ statusCode: 409, statusMessage: 'task_running_cannot_delete' });
  }
  logTaskActivity(task.projectId, taskId, user.id, 'task_deleted', { key: task.key, title: task.title });
  await rollbackTaskAttachments(taskId);
  db.delete(schema.tasks).where(eq(schema.tasks.id, taskId)).run();
  return { ok: true };
}

async function rollbackTaskAttachments(taskId: string, attachmentIds?: string[], activityIds: string[] = []) {
  if (attachmentIds && attachmentIds.length === 0) {
    if (activityIds.length) db.delete(schema.activity).where(inArray(schema.activity.id, activityIds)).run();
    return;
  }
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  const attachments = db.select().from(schema.attachments)
    .where(attachmentIds
      ? and(eq(schema.attachments.taskId, taskId), inArray(schema.attachments.id, attachmentIds))
      : eq(schema.attachments.taskId, taskId))
    .all();
  if (!attachments.length) {
    if (activityIds.length) db.delete(schema.activity).where(inArray(schema.activity.id, activityIds)).run();
    return;
  }

  const storedAnnotations = db.select().from(schema.attachmentAnnotations)
    .where(inArray(schema.attachmentAnnotations.attachmentId, attachments.map((attachment) => attachment.id)))
    .all();
  const renderedPaths = new Set(storedAnnotations.map((annotation) => annotation.renderedStoragePath));
  if (task) {
    for (const attachment of attachments) {
      renderedPaths.add(appDataDir('annotations', task.projectId, taskId, `${attachment.id}.png`));
    }
  }

  await Promise.allSettled([
    ...attachments.map((attachment) => fs.rm(attachment.storagePath, { force: true })),
    ...[...renderedPaths].map((storagePath) => fs.rm(storagePath, { force: true })),
  ]);
  db.delete(schema.attachments)
    .where(inArray(schema.attachments.id, attachments.map((attachment) => attachment.id)))
    .run();
  if (activityIds.length) db.delete(schema.activity).where(inArray(schema.activity.id, activityIds)).run();
}

async function rollbackCreatedTask(taskId: string) {
  try {
    await rollbackTaskAttachments(taskId);
  } finally {
    db.delete(schema.tasks).where(eq(schema.tasks.id, taskId)).run();
  }
}

export async function storeTaskAttachment(taskId: string, file: UploadedTaskFile, userId: string, activityIds?: string[]) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  const now = new Date().toISOString();
  const attachmentId = randomUUID();
  const safeName = file.fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'attachment';
  const storagePath = appDataDir('uploads', task.projectId, taskId, `${attachmentId}-${safeName}`);
  await fs.writeFile(storagePath, file.data);
  try {
    db.insert(schema.attachments).values({
      id: attachmentId,
      taskId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.data.byteLength,
      storagePath,
      createdBy: userId,
      createdAt: now,
    }).run();
    const activityId = logTaskActivity(task.projectId, taskId, userId, 'attachment_added', {
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.data.byteLength,
      storagePath,
    });
    activityIds?.push(activityId);
    return attachmentId;
  } catch (error) {
    db.delete(schema.attachments).where(eq(schema.attachments.id, attachmentId)).run();
    await fs.rm(storagePath, { force: true });
    throw error;
  }
}

export async function addTaskAttachments(taskId: string, files: UploadedTaskFile[], user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  const storedAttachmentIds: string[] = [];
  const activityIds: string[] = [];
  try {
    for (const file of files) {
      const attachmentId = await storeTaskAttachment(taskId, file, user.id, activityIds);
      storedAttachmentIds.push(attachmentId);
      if (file.annotation) {
        await saveAttachmentAnnotation(taskId, attachmentId, {
          annotationData: file.annotation.data,
          renderedImage: file.annotation.renderedImage,
        }, user, activityIds);
      }
    }
  } catch (error) {
    await rollbackTaskAttachments(taskId, storedAttachmentIds, activityIds);
    throw error;
  }
  return getTaskDetail(taskId, user);
}

export function getTaskAttachment(taskId: string, attachmentId: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  const attachment = db.select().from(schema.attachments)
    .where(and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.taskId, taskId)))
    .get();
  if (!attachment) throw createError({ statusCode: 404, statusMessage: 'attachment_not_found' });
  const annotation = db.select().from(schema.attachmentAnnotations)
    .where(eq(schema.attachmentAnnotations.attachmentId, attachmentId))
    .get() ?? null;
  return { task, attachment, annotation };
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string, user: User) {
  const { task, attachment, annotation } = getTaskAttachment(taskId, attachmentId, user);
  if (task.agentStatus === 'running') {
    throw createError({ statusCode: 409, statusMessage: 'task_running_cannot_delete_attachment' });
  }

  await Promise.all([
    fs.rm(attachment.storagePath, { force: true }),
    ...(annotation ? [fs.rm(annotation.renderedStoragePath, { force: true })] : []),
  ]);
  db.delete(schema.attachments).where(eq(schema.attachments.id, attachmentId)).run();
  logTaskActivity(task.projectId, taskId, user.id, 'attachment_deleted', {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
  });
  return getTaskDetail(taskId, user);
}

export async function saveAttachmentAnnotation(taskId: string, attachmentId: string, input: {
  annotationData: unknown;
  renderedImage: Buffer;
}, user: User, activityIds?: string[]) {
  const { task, attachment } = getTaskAttachment(taskId, attachmentId, user);
  if (!attachment.mimeType.startsWith('image/')) {
    throw createError({ statusCode: 400, statusMessage: 'attachment_not_image' });
  }
  const now = new Date().toISOString();
  const storagePath = appDataDir('annotations', task.projectId, taskId, `${attachmentId}.png`);
  await fs.writeFile(storagePath, input.renderedImage);
  db.insert(schema.attachmentAnnotations).values({
    attachmentId,
    annotationData: JSON.stringify(input.annotationData),
    renderedStoragePath: storagePath,
    updatedBy: user.id,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: schema.attachmentAnnotations.attachmentId,
    set: {
      annotationData: JSON.stringify(input.annotationData),
      renderedStoragePath: storagePath,
      updatedBy: user.id,
      updatedAt: now,
    },
  }).run();
  const activityId = logTaskActivity(task.projectId, taskId, user.id, 'attachment_annotated', { fileName: attachment.fileName });
  activityIds?.push(activityId);
  return getTaskDetail(taskId, user);
}

export function addTaskComment(taskId: string, body: string, mentionUserIds: string[], user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  const mentionedUsers = resolveCommentMentionUsers(task.projectId, mentionUserIds, user.id);
  const comment = insertTaskComment(taskId, body, user, 'comment');
  if (mentionedUsers.length) {
    db.insert(schema.commentMentions).values(mentionedUsers.map((mentionedUser) => ({
      commentId: comment.id,
      taskId,
      userId: mentionedUser.id,
      createdAt: comment.createdAt,
      seenAt: null,
    }))).run();
  }
  logTaskActivity(task.projectId, taskId, user.id, 'comment_added', {
    body: comment.body,
    mentionCount: mentionedUsers.length,
  });
  return {
    ...comment,
    mentions: mentionedUsers.map((mentionedUser) => ({
      userId: mentionedUser.id,
      userName: mentionedUser.name,
    })),
    mentionedCurrentUser: false,
    unreadMention: false,
  };
}

export function markTaskMentionsSeen(taskId: string, commentIds: string[], user: User) {
  const { task } = authorizeTaskAccess(taskId, user);
  const now = new Date().toISOString();
  const result = db.update(schema.commentMentions)
    .set({ seenAt: now })
    .where(and(
      eq(schema.commentMentions.taskId, taskId),
      eq(schema.commentMentions.userId, user.id),
      inArray(schema.commentMentions.commentId, [...new Set(commentIds)]),
      isNull(schema.commentMentions.seenAt),
    ))
    .run();
  if (result.changes > 0) {
    logTaskActivity(task.projectId, taskId, user.id, 'comment_mentions_seen', { count: result.changes });
  }
  return { ok: true, count: result.changes, seenAt: now };
}

export function addTaskMessage(taskId: string, body: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  if (!['running', 'queued', 'done', 'failed'].includes(task.agentStatus)) {
    throw createError({ statusCode: 409, statusMessage: 'task_not_accepting_steering' });
  }
  const comment = insertTaskComment(taskId, body, user, 'steering');
  logTaskActivity(task.projectId, taskId, user.id, 'steering_message', { body: comment.body });
  if (task.agentStatus === 'done' || task.agentStatus === 'failed') {
    requeueTaskForFollowUp(task, user.id, comment.body);
  }
  return comment;
}

export function logTaskActivity(projectId: string, taskId: string | null, userId: string | null, action: string, metadata?: unknown) {
  const activityId = randomUUID();
  db.insert(schema.activity).values({
    id: activityId,
    projectId,
    taskId,
    userId,
    action,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
    createdAt: new Date().toISOString(),
  }).run();
  return activityId;
}

export function listUsers() {
  return db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    role: schema.users.role,
    active: schema.users.active,
    createdAt: schema.users.createdAt,
  }).from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name))
    .all();
}

export function updateUser(userId: string, input: {
  name?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'member';
}, admin: User) {
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'admin_required' });
  }
  const existing = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!existing || !existing.active) {
    throw createError({ statusCode: 404, statusMessage: 'user_not_found' });
  }
  if (userId === admin.id && input.role && input.role !== 'admin') {
    throw createError({ statusCode: 400, statusMessage: 'self_admin_role_required' });
  }

  const email = input.email?.trim().toLowerCase();
  if (email && email !== existing.email) {
    const duplicate = db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();
    if (duplicate && duplicate.id !== userId) {
      throw createError({ statusCode: 409, statusMessage: 'user_email_exists' });
    }
  }

  const updates: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (email !== undefined) updates.email = email;
  if (input.password !== undefined) updates.passwordHash = hashPassword(input.password);
  if (input.role !== undefined) updates.role = input.role;

  db.update(schema.users).set(updates).where(eq(schema.users.id, userId)).run();
  return listUsers();
}

export function deleteUser(userId: string, admin: User) {
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'admin_required' });
  }
  if (userId === admin.id) {
    throw createError({ statusCode: 400, statusMessage: 'self_user_delete_forbidden' });
  }
  const existing = db.select().from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.active, true)))
    .get();
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'user_not_found' });
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(schema.tasks)
      .set({ assigneeId: null, updatedAt: now })
      .where(eq(schema.tasks.assigneeId, userId))
      .run();
    tx.delete(schema.projectUsers).where(eq(schema.projectUsers.userId, userId)).run();
    tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
    tx.update(schema.users)
      .set({ active: false, updatedAt: now })
      .where(eq(schema.users.id, userId))
      .run();
  });
  return listUsers();
}

export function addProjectUser(projectId: string, userId: string, user: User) {
  getProject(projectId, user);
  const now = new Date().toISOString();
  db.insert(schema.projectUsers).values({ projectId, userId, role: 'member', createdAt: now })
    .onConflictDoNothing()
    .run();
}

export interface UploadedTaskFile {
  fileName: string;
  mimeType: string;
  data: Buffer;
  annotation?: {
    data: unknown;
    renderedImage: Buffer;
  };
}

function insertTaskComment(taskId: string, body: string, user: User, kind: 'comment' | 'steering') {
  const now = new Date().toISOString();
  const comment = {
    id: randomUUID(),
    taskId,
    userId: user.id,
    kind,
    body: body.trim(),
    createdAt: now,
  };
  if (!comment.body) throw createError({ statusCode: 400, statusMessage: 'empty_message' });
  db.insert(schema.comments).values(comment).run();
  return {
    ...comment,
    userName: user.name,
  };
}

function resolveCommentMentionUsers(projectId: string, mentionUserIds: string[], commentingUserId: string) {
  const uniqueIds = [...new Set(mentionUserIds)].filter((userId) => userId !== commentingUserId);
  if (!uniqueIds.length) return [];
  if (uniqueIds.length > 25) {
    throw createError({ statusCode: 400, statusMessage: 'too_many_mentions' });
  }
  const mentionedUsers = db.select({
    id: schema.users.id,
    name: schema.users.name,
  })
    .from(schema.projectUsers)
    .innerJoin(schema.users, eq(schema.projectUsers.userId, schema.users.id))
    .where(and(
      eq(schema.projectUsers.projectId, projectId),
      inArray(schema.projectUsers.userId, uniqueIds),
      eq(schema.users.active, true),
    ))
    .all();
  if (mentionedUsers.length !== uniqueIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_comment_mention' });
  }
  return mentionedUsers;
}

async function cleanupCompletedTaskWorktree(
  task: typeof schema.tasks.$inferSelect,
  projectPath: string,
  userId: string,
) {
  try {
    const cleanup = await removeTaskWorktree({
      projectPath,
      worktreePath: appDataDir('worktrees', task.projectId, task.id, 'tree'),
    });
    if (cleanup.reason === 'missing') return;
    logTaskActivity(task.projectId, task.id, userId, cleanup.removed
      ? 'codex_worktree_removed'
      : 'codex_worktree_cleanup_deferred', {
      branch: cleanup.branchName,
      reason: cleanup.reason,
    });
  } catch (error) {
    logTaskActivity(task.projectId, task.id, userId, 'codex_worktree_cleanup_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function requeueTaskForFollowUp(task: typeof schema.tasks.$inferSelect, userId: string, body: string) {
  const todoColumn = db.select().from(schema.columns)
    .where(and(eq(schema.columns.projectId, task.projectId), eq(schema.columns.key, 'todo')))
    .get();
  if (!todoColumn) throw createError({ statusCode: 400, statusMessage: 'missing_todo_column' });
  const now = new Date().toISOString();
  db.update(schema.tasks).set({
    columnId: todoColumn.id,
    agentEnabled: true,
    agentStatus: 'queued',
    position: nextTaskPosition(task.projectId, todoColumn.id, task.oberthemaId, task.unterthemaId),
    updatedAt: now,
  }).where(eq(schema.tasks.id, task.id)).run();
  logTaskActivity(task.projectId, task.id, userId, 'followup_requested', { body });
  logTaskActivity(task.projectId, task.id, userId, 'codex_queued', { reason: 'follow_up' });
}

function decorateAttachment(
  attachment: typeof schema.attachments.$inferSelect,
  annotation?: typeof schema.attachmentAnnotations.$inferSelect | null,
) {
  const url = `/api/tasks/${attachment.taskId}/attachments/${attachment.id}`;
  return {
    id: attachment.id,
    taskId: attachment.taskId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    url,
    annotatedUrl: annotation ? `${url}?variant=annotated` : null,
    annotation: annotation
      ? {
          data: annotation.annotationData,
          updatedAt: annotation.updatedAt,
        }
      : null,
  };
}

function resolveTaskAssignee(
  projectId: string,
  requestedAssigneeId: string | null | undefined,
  currentUserId: string,
  defaultToCurrentUser = true,
) {
  const assigneeId = requestedAssigneeId === undefined && defaultToCurrentUser
    ? currentUserId
    : requestedAssigneeId || null;
  if (!assigneeId) return null;
  const membership = db.select({ userId: schema.projectUsers.userId })
    .from(schema.projectUsers)
    .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, assigneeId)))
    .get();
  if (!membership) throw createError({ statusCode: 400, statusMessage: 'invalid_assignee' });
  return assigneeId;
}

function getProjectTags(projectId: string) {
  return db.select().from(schema.projectTags)
    .where(eq(schema.projectTags.projectId, projectId))
    .orderBy(asc(schema.projectTags.name))
    .all()
    .map((tag) => tag.name);
}

function setProjectTags(projectId: string, rawTags: string[]) {
  const tags = normalizeTags(rawTags);
  const now = new Date().toISOString();
  db.delete(schema.projectTags).where(eq(schema.projectTags.projectId, projectId)).run();
  for (const tag of tags) {
    db.insert(schema.projectTags).values({
      projectId,
      name: tag,
      createdAt: now,
    }).onConflictDoNothing().run();
  }
  const taskIds = db.select({ id: schema.tasks.id }).from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .all()
    .map((task) => task.id);
  if (!taskIds.length) return;
  if (tags.length) {
    db.delete(schema.taskTags)
      .where(and(inArray(schema.taskTags.taskId, taskIds), notInArray(schema.taskTags.name, tags)))
      .run();
    return;
  }
  db.delete(schema.taskTags)
    .where(inArray(schema.taskTags.taskId, taskIds))
    .run();
}

function setTaskTags(taskId: string, rawTags: string[], projectId: string) {
  const allowed = new Set(getProjectTags(projectId).map((tag) => tag.toLocaleLowerCase()));
  const tags = normalizeTags(rawTags).filter((tag) => allowed.has(tag.toLocaleLowerCase()));
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(schema.taskTags).where(eq(schema.taskTags.taskId, taskId)).run();
    for (const tag of tags) {
      tx.insert(schema.taskTags).values({
        taskId,
        name: tag,
        createdAt: now,
      }).run();
    }
  });
}

function normalizeTags(rawTags: string[]) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of rawTags) {
    const tag = rawTag.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 40);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

function defaultBacklogColumn(projectId: string) {
  const column = db.select().from(schema.columns)
    .where(and(eq(schema.columns.projectId, projectId), eq(schema.columns.key, 'backlog')))
    .get();
  if (!column) throw createError({ statusCode: 400, statusMessage: 'missing_backlog_column' });
  return column.id;
}

function getProjectColumn(projectId: string, columnId: string) {
  const column = db.select().from(schema.columns)
    .where(and(eq(schema.columns.projectId, projectId), eq(schema.columns.id, columnId)))
    .get();
  if (!column) throw createError({ statusCode: 400, statusMessage: 'invalid_column' });
  return column;
}

function nextTaskPosition(projectId: string, columnId: string, oberthemaId: string, unterthemaId: string | null) {
  const baseCondition = and(
    eq(schema.tasks.projectId, projectId),
    eq(schema.tasks.columnId, columnId),
    eq(schema.tasks.oberthemaId, oberthemaId),
  );
  const condition = unterthemaId
    ? and(baseCondition, eq(schema.tasks.unterthemaId, unterthemaId))
    : and(baseCondition, isNull(schema.tasks.unterthemaId));
  return (db.select({ value: max(schema.tasks.position) }).from(schema.tasks).where(condition).get()?.value ?? 0) + 1000;
}

type TopicColor = 'teal' | 'coral' | 'amber' | 'indigo' | 'emerald';

interface TopicInput {
  name: string;
  description?: string | null;
  color?: TopicColor;
  position?: number;
}

interface SubtopicInput {
  name: string;
  description?: string | null;
  position?: number;
}

function requireOberthema(oberthemaId: string, user: User) {
  const topic = db.select().from(schema.oberthemen).where(eq(schema.oberthemen.id, oberthemaId)).get();
  if (!topic) throw createError({ statusCode: 404, statusMessage: 'oberthema_not_found' });
  getProject(topic.projectId, user);
  return topic;
}

function requireUnterthema(unterthemaId: string, user: User) {
  const subtopic = db.select().from(schema.unterthemen).where(eq(schema.unterthemen.id, unterthemaId)).get();
  if (!subtopic) throw createError({ statusCode: 404, statusMessage: 'unterthema_not_found' });
  const topic = requireOberthema(subtopic.oberthemaId, user);
  return { subtopic, topic };
}

function ensureOberthemaNameAvailable(projectId: string, name: string, excludeId?: string) {
  const existing = db.select({ id: schema.oberthemen.id })
    .from(schema.oberthemen)
    .where(and(
      eq(schema.oberthemen.projectId, projectId),
      sql`lower(${schema.oberthemen.name}) = lower(${name})`,
    ))
    .get();
  if (existing && existing.id !== excludeId) {
    throw createError({ statusCode: 409, statusMessage: 'oberthema_name_exists' });
  }
}

function ensureUnterthemaNameAvailable(oberthemaId: string, name: string, excludeId?: string) {
  const existing = db.select({ id: schema.unterthemen.id })
    .from(schema.unterthemen)
    .where(and(
      eq(schema.unterthemen.oberthemaId, oberthemaId),
      sql`lower(${schema.unterthemen.name}) = lower(${name})`,
    ))
    .get();
  if (existing && existing.id !== excludeId) {
    throw createError({ statusCode: 409, statusMessage: 'unterthema_name_exists' });
  }
}

function resolveTaskPlacement(
  projectId: string,
  requestedOberthemaId: string | null | undefined,
  requestedUnterthemaId: string | null | undefined,
  user: User,
) {
  if (requestedUnterthemaId) {
    const { subtopic, topic } = requireUnterthema(requestedUnterthemaId, user);
    if (topic.projectId !== projectId || (requestedOberthemaId && requestedOberthemaId !== topic.id)) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_unterthema' });
    }
    return { oberthemaId: topic.id, unterthemaId: subtopic.id };
  }
  if (requestedOberthemaId) {
    const topic = requireOberthema(requestedOberthemaId, user);
    if (topic.projectId !== projectId) throw createError({ statusCode: 400, statusMessage: 'invalid_oberthema' });
    return { oberthemaId: topic.id, unterthemaId: null };
  }
  const fallback = db.select({ unterthemaId: schema.unterthemen.id, oberthemaId: schema.oberthemen.id })
    .from(schema.unterthemen)
    .innerJoin(schema.oberthemen, eq(schema.unterthemen.oberthemaId, schema.oberthemen.id))
    .where(eq(schema.oberthemen.projectId, projectId))
    .orderBy(asc(schema.oberthemen.position), asc(schema.unterthemen.position))
    .get();
  if (!fallback) throw createError({ statusCode: 400, statusMessage: 'missing_unterthema' });
  return fallback;
}

function getTaskHierarchy(oberthemaId: string, unterthemaId: string | null) {
  const oberthema = db.select().from(schema.oberthemen).where(eq(schema.oberthemen.id, oberthemaId)).get();
  if (!oberthema) return null;
  const unterthema = unterthemaId
    ? db.select().from(schema.unterthemen).where(eq(schema.unterthemen.id, unterthemaId)).get() ?? null
    : null;
  return { oberthema, unterthema };
}

function nextTaskKey(projectKey: string) {
  const rows = db.select({ key: schema.tasks.key }).from(schema.tasks)
    .where(sql`${schema.tasks.key} LIKE ${`${projectKey}-%`}`)
    .all();
  const maxNumber = rows.reduce((maxValue, row) => {
    const parsed = Number.parseInt(row.key.slice(projectKey.length + 1), 10);
    return Number.isFinite(parsed) ? Math.max(maxValue, parsed) : maxValue;
  }, 0);
  return `${projectKey}-${maxNumber + 1}`;
}

function normalizeProjectKey(key: string) {
  const normalized = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw createError({ statusCode: 400, statusMessage: 'invalid_project_key' });
  return normalized;
}
