import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type Database from 'better-sqlite3';

export const BACKUP_FORMAT = 'agent-kanban-backup';
export const BACKUP_FORMAT_VERSION = 1;

const columnLocatorSchema = z.object({
  type: z.literal('column'),
  table: z.enum([
    'attachments',
    'attachment_annotations',
    'wiki_images',
    'task_refinement_artifacts',
    'e2e_test_case_assets',
    'e2e_test_run_artifacts',
  ]),
  rowId: z.string().min(1),
  column: z.enum(['storage_path', 'rendered_storage_path']),
}).strict();

const chatAttachmentLocatorSchema = z.object({
  type: z.literal('chat_attachment'),
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
}).strict();

const chatArtifactLocatorSchema = z.object({
  type: z.literal('chat_artifact'),
  messageId: z.string().min(1),
  sourceUrl: z.string().min(1),
}).strict();

export const backupFileSchema = z.object({
  projectId: z.string().min(1),
  archivePath: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  locator: z.discriminatedUnion('type', [columnLocatorSchema, chatAttachmentLocatorSchema, chatArtifactLocatorSchema]),
}).strict();

export const backupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.string().datetime(),
  schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  database: z.object({
    archivePath: z.literal('database/kanban.sqlite'),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  scope: z.object({
    users: z.number().int().nonnegative(),
    projects: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    totalFileBytes: z.number().int().nonnegative(),
  }).strict(),
  projects: z.array(z.object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    folderPath: z.string().min(1),
    taskCount: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
    fileBytes: z.number().int().nonnegative(),
  }).strict()),
  files: z.array(backupFileSchema),
}).strict();

export type BackupManifest = z.infer<typeof backupManifestSchema>;
export type BackupFile = z.infer<typeof backupFileSchema>;
export type BackupFileLocator = BackupFile['locator'];

export function databaseSchemaFingerprint(database: Database.Database) {
  const rows = database.prepare(`
    SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
    ORDER BY type, name
  `).all() as Array<{ type: string; name: string; tableName: string; sql: string }>;
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function safeArchiveSegment(value: string, fallback = 'file') {
  const safe = value
    .normalize('NFC')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001F\u007F]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/^\.+/, '_')
    .slice(0, 160);
  return safe || fallback;
}

export function backupFileName(exportedAt: string) {
  return `agent-kanban-backup-${exportedAt.replace(/[:.]/g, '-').replace('T', '_')}.zip`;
}

export function validateArchivePath(value: string) {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && !normalized.startsWith('../') && normalized !== '..';
}
