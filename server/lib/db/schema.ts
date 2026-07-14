import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  folderPath: text('folder_path').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectUsers = sqliteTable('project_users', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['member'] }).notNull().default('member'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.userId] }),
}));

export const projectTags = sqliteTable('project_tags', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.name] }),
}));

export const columns = sqliteTable('columns', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  nameEn: text('name_en').notNull(),
  nameDe: text('name_de').notNull(),
  position: integer('position').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const oberthemen = sqliteTable('oberthemen', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('teal'),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const unterthemen = sqliteTable('unterthemen', {
  id: text('id').primaryKey(),
  oberthemaId: text('oberthema_id').notNull().references(() => oberthemen.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const swimlanes = sqliteTable('swimlanes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameDe: text('name_de').notNull(),
  position: integer('position').notNull(),
  createdAt: text('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  oberthemaId: text('oberthema_id').notNull().references(() => oberthemen.id),
  unterthemaId: text('unterthema_id').references(() => unterthemen.id),
  columnId: text('column_id').notNull().references(() => columns.id),
  swimlaneId: text('swimlane_id').references(() => swimlanes.id),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).notNull().default('normal'),
  position: integer('position').notNull().default(0),
  createdBy: text('created_by').notNull().references(() => users.id),
  assigneeId: text('assignee_id').references(() => users.id),
  agentEnabled: integer('agent_enabled', { mode: 'boolean' }).notNull().default(false),
  agentStatus: text('agent_status', { enum: ['idle', 'queued', 'running', 'failed', 'done'] }).notNull().default('idle'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
});

export const taskTags = sqliteTable('task_tags', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.taskId, table.name] }),
}));

export const attachmentAnnotations = sqliteTable('attachment_annotations', {
  attachmentId: text('attachment_id').primaryKey().references(() => attachments.id, { onDelete: 'cascade' }),
  annotationData: text('annotation_data').notNull(),
  renderedStoragePath: text('rendered_storage_path').notNull(),
  updatedBy: text('updated_by').notNull().references(() => users.id),
  updatedAt: text('updated_at').notNull(),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['comment', 'steering'] }).notNull().default('comment'),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
});

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectTag = typeof projectTags.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Oberthema = typeof oberthemen.$inferSelect;
export type Unterthema = typeof unterthemen.$inferSelect;
export type Swimlane = typeof swimlanes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type TaskTag = typeof taskTags.$inferSelect;
export type AttachmentAnnotation = typeof attachmentAnnotations.$inferSelect;
