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

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
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
  refinedDescription: text('refined_description'),
  descriptionSource: text('description_source', { enum: ['original', 'refined'] }).notNull().default('original'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).notNull().default('normal'),
  position: integer('position').notNull().default(0),
  createdBy: text('created_by').notNull().references(() => users.id),
  clientRequestId: text('client_request_id'),
  assigneeId: text('assignee_id').references(() => users.id),
  agentEnabled: integer('agent_enabled', { mode: 'boolean' }).notNull().default(false),
  agentStatus: text('agent_status', { enum: ['idle', 'queued', 'running', 'failed', 'done'] }).notNull().default('idle'),
  agentHarness: text('agent_harness', { enum: ['codex', 'opencode', 'prime-agent'] }).notNull().default('codex'),
  reasoningEffort: text('reasoning_effort', { enum: ['low', 'medium', 'xhigh'] }).notNull().default('xhigh'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const taskRefinements = sqliteTable('task_refinements', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: text('status', { enum: ['queued', 'running', 'awaiting_input', 'completed', 'failed'] }).notNull().default('queued'),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  brief: text('brief'),
  visualMode: text('visual_mode', { enum: ['auto', 'off', 'force'] }).notNull().default('auto'),
  sourceDescription: text('source_description'),
  sourceTaskUpdatedAt: text('source_task_updated_at').notNull(),
  sourceCodeRevision: text('source_code_revision'),
  resultCodeRevision: text('result_code_revision'),
  questionsJson: text('questions_json').notNull().default('[]'),
  round: integer('round').notNull().default(1),
  resultMarkdown: text('result_markdown'),
  resultJson: text('result_json'),
  complexity: text('complexity', { enum: ['simple', 'moderate', 'complex'] }),
  visualsJson: text('visuals_json').notNull().default('[]'),
  threadId: text('thread_id'),
  leaseOwner: text('lease_owner'),
  leaseToken: text('lease_token'),
  leaseExpiresAt: text('lease_expires_at'),
  heartbeatAt: text('heartbeat_at'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  awaitingInputAt: text('awaiting_input_at'),
  completedAt: text('completed_at'),
  failedAt: text('failed_at'),
  appliedAt: text('applied_at'),
  appliedBy: text('applied_by').references(() => users.id),
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

export const commentMentions = sqliteTable('comment_mentions', {
  commentId: text('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  seenAt: text('seen_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.commentId, table.userId] }),
}));

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
export type ApiToken = typeof apiTokens.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectTag = typeof projectTags.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Oberthema = typeof oberthemen.$inferSelect;
export type Unterthema = typeof unterthemen.$inferSelect;
export type Swimlane = typeof swimlanes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskRefinement = typeof taskRefinements.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type TaskTag = typeof taskTags.$inferSelect;
export type AttachmentAnnotation = typeof attachmentAnnotations.$inferSelect;
