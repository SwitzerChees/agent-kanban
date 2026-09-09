import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { createError } from 'h3';
import { appDataRoot } from '../db';
import { safeArchiveSegment, type BackupFile, type BackupFileLocator } from './format';

interface InventoryFile extends BackupFile {
  storagePath: string;
}

interface ColumnSpec {
  table: Extract<BackupFileLocator, { type: 'column' }>['table'];
  column: Extract<BackupFileLocator, { type: 'column' }>['column'];
  sql: string;
}

const COLUMN_FILES: ColumnSpec[] = [
  {
    table: 'attachments', column: 'storage_path',
    sql: `SELECT a.id rowId, t.project_id projectId, a.file_name fileName, a.storage_path storagePath FROM attachments a JOIN tasks t ON t.id = a.task_id`,
  },
  {
    table: 'attachment_annotations', column: 'rendered_storage_path',
    sql: `SELECT aa.attachment_id rowId, t.project_id projectId, a.file_name || '-annotated.png' fileName, aa.rendered_storage_path storagePath FROM attachment_annotations aa JOIN attachments a ON a.id = aa.attachment_id JOIN tasks t ON t.id = a.task_id`,
  },
  {
    table: 'wiki_images', column: 'storage_path',
    sql: `SELECT wi.id rowId, wp.project_id projectId, wi.file_name fileName, wi.storage_path storagePath FROM wiki_images wi JOIN wiki_pages wp ON wp.id = wi.page_id`,
  },
  {
    table: 'wiki_images', column: 'rendered_storage_path',
    sql: `SELECT wi.id rowId, wp.project_id projectId, wi.file_name || '-annotated.png' fileName, wi.rendered_storage_path storagePath FROM wiki_images wi JOIN wiki_pages wp ON wp.id = wi.page_id WHERE wi.rendered_storage_path IS NOT NULL`,
  },
  {
    table: 'task_refinement_artifacts', column: 'storage_path',
    sql: `SELECT tra.id rowId, t.project_id projectId, tra.file_name fileName, tra.storage_path storagePath FROM task_refinement_artifacts tra JOIN tasks t ON t.id = tra.task_id`,
  },
  {
    table: 'e2e_test_case_assets', column: 'storage_path',
    sql: `SELECT a.id rowId, c.project_id projectId, a.file_name fileName, a.storage_path storagePath FROM e2e_test_case_assets a JOIN e2e_test_cases c ON c.id = a.case_id`,
  },
  {
    table: 'e2e_test_run_artifacts', column: 'storage_path',
    sql: `SELECT a.id rowId, r.project_id projectId, a.file_name fileName, a.storage_path storagePath FROM e2e_test_run_artifacts a JOIN e2e_test_runs r ON r.id = a.run_id`,
  },
];

export async function buildFileInventory(database: Database.Database): Promise<InventoryFile[]> {
  const files: InventoryFile[] = [];
  const allocate = uniqueArchivePathAllocator();
  for (const spec of COLUMN_FILES) {
    const rows = database.prepare(spec.sql).all() as Array<{ rowId: string; projectId: string; fileName: string; storagePath: string }>;
    for (const row of rows) {
      files.push(await inventoryFile(row.projectId, row.fileName, row.storagePath, {
        type: 'column', table: spec.table, rowId: row.rowId, column: spec.column,
      }, allocate));
    }
  }

  const messages = database.prepare(`
    SELECT m.id messageId, m.content, m.attachments_json attachmentsJson, t.id threadId, t.project_id projectId
    FROM project_chat_messages m JOIN project_chat_threads t ON t.id = m.thread_id
  `).all() as Array<{ messageId: string; content: string; attachmentsJson: string; threadId: string; projectId: string }>;
  for (const message of messages) {
    for (const attachment of parseChatAttachments(message.attachmentsJson)) {
      files.push(await inventoryFile(message.projectId, attachment.fileName, attachment.storagePath, {
        type: 'chat_attachment', messageId: message.messageId, attachmentId: attachment.id,
      }, allocate));
    }
    for (const artifact of chatArtifactReferences(message.content, message.threadId, message.projectId)) {
      files.push(await inventoryFile(message.projectId, path.basename(artifact.storagePath), artifact.storagePath, {
        type: 'chat_artifact', messageId: message.messageId, sourceUrl: artifact.sourceUrl,
      }, allocate, artifact.allowedRoots));
    }
  }
  return files;
}

async function inventoryFile(
  projectId: string,
  fileName: string,
  storagePath: string,
  locator: BackupFileLocator,
  allocate: (requested: string) => string,
  allowedRoots = [appDataRoot()],
): Promise<InventoryFile> {
  let resolved: string;
  let fileStat;
  try {
    const sourceStat = await lstat(storagePath);
    if (sourceStat.isSymbolicLink()) {
      throw createError({ statusCode: 409, statusMessage: 'backup_file_invalid', data: { projectId, fileName } });
    }
    resolved = await realpath(storagePath);
    fileStat = await lstat(resolved);
  } catch (error) {
    if (isHttpError(error)) throw error;
    throw createError({ statusCode: 409, statusMessage: 'backup_file_missing', data: { projectId, fileName } });
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw createError({ statusCode: 409, statusMessage: 'backup_file_invalid', data: { projectId, fileName } });
  }
  const rootAllowed = await anyAllowedRoot(resolved, allowedRoots);
  if (!rootAllowed) {
    throw createError({ statusCode: 409, statusMessage: 'backup_file_outside_managed_storage', data: { projectId, fileName } });
  }
  const sha256 = await hashFile(resolved);
  const kind = locator.type === 'column' ? locator.table : locator.type;
  const archivePath = allocate(`files/${safeArchiveSegment(projectId, 'project')}/${kind}/${safeArchiveSegment(fileName)}`);
  return { projectId, archivePath, size: fileStat.size, sha256, locator, storagePath: resolved };
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error);
}

async function anyAllowedRoot(candidate: string, roots: string[]) {
  for (const root of roots) {
    const resolvedRoot = await realpath(root).catch(() => path.resolve(root));
    const relative = path.relative(resolvedRoot, candidate);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return true;
  }
  return false;
}

function parseChatAttachments(value: string) {
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is { id: string; fileName: string; storagePath: string } => (
      row && typeof row === 'object' && typeof row.id === 'string'
      && typeof row.fileName === 'string' && typeof row.storagePath === 'string'
    ));
  } catch {
    return [];
  }
}

function chatArtifactReferences(content: string, threadId: string, projectId: string) {
  const pattern = new RegExp(`/api/project-chats/${escapeRegExp(threadId)}/artifacts/([A-Za-z0-9_-]+)`, 'g');
  const seen = new Set<string>();
  const result: Array<{ sourceUrl: string; storagePath: string; allowedRoots: string[] }> = [];
  for (const match of content.matchAll(pattern)) {
    const sourceUrl = match[0];
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    try {
      const storagePath = Buffer.from(match[1]!, 'base64url').toString('utf8');
      result.push({
        sourceUrl,
        storagePath,
        allowedRoots: [
          path.join(appDataRoot(), 'worktrees', projectId, threadId, 'tree'),
          path.join(appDataRoot(), 'chat-sessions', threadId, 'artifacts'),
          path.join(appDataRoot(), 'imported-files'),
        ],
      });
    } catch {
      throw createError({ statusCode: 409, statusMessage: 'backup_chat_artifact_invalid' });
    }
  }
  return result;
}

async function hashFile(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function uniqueArchivePathAllocator() {
  const used = new Set<string>();
  return (requested: string) => {
    const parsed = path.posix.parse(requested);
    let candidate = requested;
    let suffix = 2;
    while (used.has(candidate.toLocaleLowerCase('en'))) {
      candidate = path.posix.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    }
    used.add(candidate.toLocaleLowerCase('en'));
    return candidate;
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
