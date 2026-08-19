import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  agentConcurrencyLimit: integer('agent_concurrency_limit').notNull().default(1),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectHarnessLimits = sqliteTable('project_harness_limits', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  harness: text('harness', { enum: ['codex', 'opencode', 'prime-agent'] }).notNull(),
  maxConcurrentTasks: integer('max_concurrent_tasks').notNull().default(1),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.harness] }),
}));

export const projectUsers = sqliteTable('project_users', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['member'] }).notNull().default('member'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.userId] }),
}));

export const projectChatThreads = sqliteTable('project_chat_threads', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New chat'),
  harness: text('harness', { enum: ['codex', 'opencode', 'prime-agent'] }).notNull().default('prime-agent'),
  reasoningEffort: text('reasoning_effort', { enum: ['low', 'medium', 'xhigh'] }).notNull().default('low'),
  status: text('status', { enum: ['ready', 'running', 'failed'] }).notNull().default('ready'),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
  nativeSessionId: text('native_session_id'),
  sourceRevision: text('source_revision'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectChatMessages = sqliteTable('project_chat_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => projectChatThreads.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull().default(''),
  attachmentsJson: text('attachments_json').notNull().default('[]'),
  state: text('state', { enum: ['complete', 'streaming', 'failed', 'cancelled'] }).notNull().default('complete'),
  clientRequestId: text('client_request_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectChatEvents = sqliteTable('project_chat_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').notNull().references(() => projectChatThreads.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: text('payload').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
});

export const projectChatVoiceCommands = sqliteTable('project_chat_voice_commands', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => projectChatThreads.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['orchestrate', 'delegate', 'steer', 'cancel'] }).notNull(),
  status: text('status', { enum: ['pending_confirmation', 'queued', 'dispatched', 'completed', 'cancelled', 'rejected', 'failed'] }).notNull(),
  transcript: text('transcript').notNull(),
  instruction: text('instruction').notNull().default(''),
  taskTitle: text('task_title').notNull().default(''),
  targetTaskId: text('target_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  spokenResponse: text('spoken_response').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectChatVoiceJobs = sqliteTable('project_chat_voice_jobs', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => projectChatThreads.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  commandId: text('command_id').references(() => projectChatVoiceCommands.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'cancelled'] }).notNull().default('queued'),
  instruction: text('instruction').notNull(),
  latestProgress: text('latest_progress'),
  lastProgressAt: text('last_progress_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

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
}, (table) => [
  // Matches the raw bootstrap DDL: UNIQUE(project_id, name).
  uniqueIndex('idx_oberthemen_project_name').on(table.projectId, table.name),
]);

export const unterthemen = sqliteTable('unterthemen', {
  id: text('id').primaryKey(),
  oberthemaId: text('oberthema_id').notNull().references(() => oberthemen.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  // Matches the raw bootstrap DDL: UNIQUE(oberthema_id, name).
  uniqueIndex('idx_unterthemen_oberthema_name').on(table.oberthemaId, table.name),
]);

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
  agentStatus: text('agent_status', { enum: ['idle', 'queued', 'running', 'waiting_external', 'failed', 'done'] }).notNull().default('idle'),
  agentHarness: text('agent_harness', { enum: ['codex', 'opencode', 'prime-agent'] }).notNull().default('codex'),
  reasoningEffort: text('reasoning_effort', { enum: ['low', 'medium', 'xhigh'] }).notNull().default('xhigh'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const taskAgentRuns = sqliteTable('task_agent_runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  harness: text('harness', { enum: ['codex', 'opencode', 'prime-agent'] }).notNull(),
  status: text('status', { enum: ['running', 'waiting_external', 'completed', 'failed', 'cancelled'] }).notNull(),
  nativeSessionId: text('native_session_id'),
  currentUnitName: text('current_unit_name'),
  browserSessionName: text('browser_session_name'),
  waitKind: text('wait_kind', { enum: ['ci', 'deployment', 'rate_limit', 'other'] }),
  waitReason: text('wait_reason'),
  resumeAt: text('resume_at'),
  waitCount: integer('wait_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const taskRefinements = sqliteTable('task_refinements', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: text('status', { enum: ['queued', 'running', 'awaiting_input', 'completed', 'failed', 'cancelled'] }).notNull().default('queued'),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  parentRefinementId: text('parent_refinement_id'),
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
  cancelledAt: text('cancelled_at'),
  appliedAt: text('applied_at'),
  appliedBy: text('applied_by').references(() => users.id),
  updatedAt: text('updated_at').notNull(),
});

export const taskRefinementComments = sqliteTable('task_refinement_comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  refinementId: text('refinement_id').notNull().references(() => taskRefinements.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  quote: text('quote').notNull(),
  prefix: text('prefix').notNull().default(''),
  suffix: text('suffix').notNull().default(''),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  body: text('body').notNull(),
  incorporatedByRefinementId: text('incorporated_by_refinement_id'),
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
export type ProjectHarnessLimit = typeof projectHarnessLimits.$inferSelect;
export type ProjectChatThread = typeof projectChatThreads.$inferSelect;
export type ProjectChatMessage = typeof projectChatMessages.$inferSelect;
export type ProjectChatEvent = typeof projectChatEvents.$inferSelect;
export type ProjectChatVoiceCommand = typeof projectChatVoiceCommands.$inferSelect;
export type ProjectChatVoiceJob = typeof projectChatVoiceJobs.$inferSelect;
export type ProjectTag = typeof projectTags.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Oberthema = typeof oberthemen.$inferSelect;
export type Unterthema = typeof unterthemen.$inferSelect;
export type Swimlane = typeof swimlanes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskAgentRun = typeof taskAgentRuns.$inferSelect;
export type TaskRefinement = typeof taskRefinements.$inferSelect;
export type TaskRefinementComment = typeof taskRefinementComments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type TaskTag = typeof taskTags.$inferSelect;
export type AttachmentAnnotation = typeof attachmentAnnotations.$inferSelect;
