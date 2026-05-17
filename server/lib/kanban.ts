import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { createError } from 'h3';
import { appDataDir, db, schema } from './db';
import type { User } from './db/schema';

const DEFAULT_COLUMNS = [
  { key: 'backlog', nameEn: 'Backlog', nameDe: 'Backlog', position: 0, done: false },
  { key: 'todo', nameEn: 'To Do', nameDe: 'Zu erledigen', position: 1, done: false },
  { key: 'in_progress', nameEn: 'In Progress', nameDe: 'In Bearbeitung', position: 2, done: false },
  { key: 'in_review', nameEn: 'In Review', nameDe: 'In Pruefung', position: 3, done: false },
  { key: 'done', nameEn: 'Done', nameDe: 'Erledigt', position: 4, done: true },
];

export async function createProject(input: {
  name: string;
  key: string;
  description?: string | null;
  folderPath: string;
  userIds?: string[];
}, admin: User) {
  const now = new Date().toISOString();
  const folderPath = path.resolve(input.folderPath);
  await fs.mkdir(folderPath, { recursive: true });

  const projectId = randomUUID();
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

    for (const column of DEFAULT_COLUMNS) {
      tx.insert(schema.columns).values({
        id: randomUUID(),
        projectId,
        ...column,
        createdAt: now,
      }).run();
    }

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
  const taskRows = db.select().from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .orderBy(asc(schema.tasks.position), desc(schema.tasks.createdAt))
    .all();
  const taskIds = taskRows.map((task) => task.id);
  const taskAttachments = taskIds.length
    ? db.select().from(schema.attachments).where(inArray(schema.attachments.taskId, taskIds)).all()
    : [];
  const members = db.select({ user: schema.users })
    .from(schema.projectUsers)
    .innerJoin(schema.users, eq(schema.projectUsers.userId, schema.users.id))
    .where(eq(schema.projectUsers.projectId, projectId))
    .orderBy(asc(schema.users.name))
    .all()
    .map((row) => ({ id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role }));

  return {
    project,
    columns: projectColumns,
    swimlanes: lanes,
    members,
    tasks: taskRows.map((task) => ({
      ...task,
      attachments: taskAttachments.filter((attachment) => attachment.taskId === task.id),
    })),
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

export async function createTask(projectId: string, input: {
  title: string;
  description?: string | null;
  columnId?: string | null;
  swimlaneId?: string | null;
  assigneeId?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  files?: UploadedTaskFile[];
}, user: User) {
  const project = getProject(projectId, user);
  const now = new Date().toISOString();
  const columnId = input.columnId || defaultBacklogColumn(projectId);
  const position = nextTaskPosition(projectId, columnId, input.swimlaneId ?? null);
  const taskId = randomUUID();
  const taskKey = nextTaskKey(project.key);

  db.insert(schema.tasks).values({
    id: taskId,
    projectId,
    columnId,
    swimlaneId: input.swimlaneId || null,
    key: taskKey,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority ?? 'normal',
    position,
    createdBy: user.id,
    assigneeId: input.assigneeId || null,
    agentStatus: 'idle',
    createdAt: now,
    updatedAt: now,
  }).run();

  for (const file of input.files ?? []) {
    await storeTaskAttachment(taskId, file, user.id);
  }

  return getBoard(projectId, user).tasks.find((task) => task.id === taskId);
}

export function updateTask(taskId: string, input: {
  title?: string;
  description?: string | null;
  columnId?: string;
  swimlaneId?: string | null;
  assigneeId?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  position?: number;
  agentStatus?: 'idle' | 'queued' | 'running' | 'failed' | 'done';
}, user: User) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  getProject(task.projectId, user);

  db.update(schema.tasks).set({
    title: input.title?.trim() || undefined,
    description: input.description === undefined ? undefined : input.description?.trim() || null,
    columnId: input.columnId,
    swimlaneId: input.swimlaneId === undefined ? undefined : input.swimlaneId,
    assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
    priority: input.priority,
    position: input.position,
    agentStatus: input.agentStatus,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.tasks.id, taskId)).run();

  return db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
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

function defaultBacklogColumn(projectId: string) {
  const column = db.select().from(schema.columns)
    .where(and(eq(schema.columns.projectId, projectId), eq(schema.columns.key, 'backlog')))
    .get();
  if (!column) throw createError({ statusCode: 400, statusMessage: 'missing_backlog_column' });
  return column.id;
}

function nextTaskPosition(projectId: string, columnId: string, swimlaneId: string | null) {
  const condition = swimlaneId
    ? and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.columnId, columnId), eq(schema.tasks.swimlaneId, swimlaneId))
    : and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.columnId, columnId), sql`${schema.tasks.swimlaneId} IS NULL`);
  return (db.select({ value: max(schema.tasks.position) }).from(schema.tasks).where(condition).get()?.value ?? 0) + 1;
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
