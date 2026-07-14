import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, max, notInArray, sql } from 'drizzle-orm';
import { createError } from 'h3';
import { appDataDir, db, schema } from './db';
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
      ...task,
      attachments: taskAttachments
        .filter((attachment) => attachment.taskId === task.id)
        .map((attachment) => decorateAttachment(attachment, annotations.find((annotation) => annotation.attachmentId === attachment.id))),
      tags: taskTags.filter((tag) => tag.taskId === task.id).map((tag) => tag.name),
    })),
  };
}

export function getTaskDetail(taskId: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  const project = getProject(task.projectId, user);
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
  const events = db.select().from(schema.activity)
    .where(eq(schema.activity.taskId, taskId))
    .orderBy(asc(schema.activity.createdAt))
    .all();

  return {
    project,
    projectTags: getProjectTags(project.id),
    hierarchy: getTaskHierarchy(task.oberthemaId, task.unterthemaId),
    task: {
      ...task,
      attachments: attachments.map((attachment) => decorateAttachment(attachment, annotations.find((annotation) => annotation.attachmentId === attachment.id))),
      tags,
    },
    comments,
    events,
  };
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

export async function createTask(projectId: string, input: {
  title: string;
  description?: string | null;
  columnId?: string | null;
  swimlaneId?: string | null;
  oberthemaId?: string | null;
  unterthemaId?: string | null;
  assigneeId?: string | null;
  agentEnabled?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  files?: UploadedTaskFile[];
}, user: User) {
  const project = getProject(projectId, user);
  const assigneeId = resolveTaskAssignee(projectId, input.assigneeId, user.id);
  const now = new Date().toISOString();
  const columnId = defaultBacklogColumn(projectId);
  const column = getProjectColumn(projectId, columnId);
  const placement = resolveTaskPlacement(projectId, input.oberthemaId, input.unterthemaId, user);
  const position = nextTaskPosition(projectId, columnId, placement.oberthemaId, placement.unterthemaId);
  const taskId = randomUUID();
  const taskKey = nextTaskKey(project.key);

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
    assigneeId,
    agentEnabled: input.agentEnabled ?? false,
    agentStatus: 'idle',
    createdAt: now,
    updatedAt: now,
  }).run();

  if (input.tags?.length) {
    setTaskTags(taskId, input.tags, projectId);
  }

  for (const file of input.files ?? []) {
    await storeTaskAttachment(taskId, file, user.id);
  }
  logTaskActivity(projectId, taskId, user.id, 'task_created', { columnKey: column.key, tags: normalizeTags(input.tags ?? []) });

  return getBoard(projectId, user).tasks.find((task) => task.id === taskId);
}

export function updateTask(taskId: string, input: {
  title?: string;
  description?: string | null;
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
  getProject(task.projectId, user);
  if ((task.agentStatus === 'running' || task.agentStatus === 'done' || task.agentStatus === 'failed') && (input.title !== undefined || input.description !== undefined)) {
    throw createError({ statusCode: 409, statusMessage: 'task_locked_after_agent_start' });
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
    const targetColumn = getProjectColumn(task.projectId, input.columnId);
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
    agentModeChanged: input.agentEnabled !== undefined && input.agentEnabled !== task.agentEnabled,
    assigneeChanged: input.assigneeId !== undefined && nextAssigneeId !== task.assigneeId,
    agentStatus: nextAgentStatus,
  });
  if (nextAgentStatus === 'queued' && task.agentStatus !== 'queued') {
    logTaskActivity(task.projectId, taskId, user.id, 'codex_queued', { reason: 'moved_to_todo' });
  }
  return updated;
}

export function deleteTask(taskId: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  if (task.agentStatus === 'running') {
    throw createError({ statusCode: 409, statusMessage: 'task_running_cannot_delete' });
  }
  logTaskActivity(task.projectId, taskId, user.id, 'task_deleted', { key: task.key, title: task.title });
  db.delete(schema.tasks).where(eq(schema.tasks.id, taskId)).run();
  return { ok: true };
}

export async function storeTaskAttachment(taskId: string, file: UploadedTaskFile, userId: string) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  const now = new Date().toISOString();
  const attachmentId = randomUUID();
  const safeName = file.fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'attachment';
  const storagePath = appDataDir('uploads', task.projectId, taskId, `${attachmentId}-${safeName}`);
  await fs.writeFile(storagePath, file.data);
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
  logTaskActivity(task.projectId, taskId, userId, 'attachment_added', {
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.data.byteLength,
    storagePath,
  });
}

export async function addTaskAttachments(taskId: string, files: UploadedTaskFile[], user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  for (const file of files) {
    await storeTaskAttachment(taskId, file, user.id);
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
}, user: User) {
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
  logTaskActivity(task.projectId, taskId, user.id, 'attachment_annotated', { fileName: attachment.fileName });
  return getTaskDetail(taskId, user);
}

export function addTaskComment(taskId: string, body: string, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);
  const comment = insertTaskComment(taskId, body, user, 'comment');
  logTaskActivity(task.projectId, taskId, user.id, 'comment_added', { body: comment.body });
  return comment;
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
  db.insert(schema.activity).values({
    id: randomUUID(),
    projectId,
    taskId,
    userId,
    action,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
    createdAt: new Date().toISOString(),
  }).run();
}

export function listUsers() {
  return db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    role: schema.users.role,
    active: schema.users.active,
    createdAt: schema.users.createdAt,
  }).from(schema.users).orderBy(asc(schema.users.name)).all();
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
