import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import { createError } from 'h3';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { appDataDir, appDataRoot, sqliteDatabase } from '../db';
import { backupManifestSchema, databaseSchemaFingerprint, validateArchivePath, type BackupFile, type BackupManifest } from './format';

const IMPORT_EXPIRY_MS = 60 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const IMPORT_CONFIRMATION = 'IMPORT';

interface StoredImportPreview {
  importId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  manifest: BackupManifest;
}

export type ImportProjectPreview = BackupManifest['projects'][number] & {
  action: 'create' | 'replace';
  effectiveFolderPath: string;
  folderPathExists: boolean;
  blockedReason: string | null;
};

export interface ImportPreviewResponse {
  importId: string;
  exportedAt: string;
  expiresAt: string;
  scope: BackupManifest['scope'];
  projects: ImportProjectPreview[];
  users: Array<{ id: string; email: string; name: string; role: string; active: number }>;
  warnings: string[];
}

export async function stageImportArchive(stream: Readable, userId: string, contentLength?: number): Promise<ImportPreviewResponse> {
  const maxArchiveBytes = positiveLimit(process.env.KANBAN_BACKUP_MAX_ARCHIVE_BYTES, MAX_ARCHIVE_BYTES);
  if (contentLength && contentLength > maxArchiveBytes) {
    throw createError({ statusCode: 413, statusMessage: 'backup_archive_too_large' });
  }
  await cleanupExpiredImports();
  const importId = randomUUID();
  const directory = importDirectory(importId);
  const archivePath = path.join(directory, 'package.zip');
  const extractedPath = path.join(directory, 'extracted');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    let received = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > maxArchiveBytes ? new Error('backup_archive_too_large') : null, chunk);
      },
    });
    await pipeline(stream, limiter, createWriteStream(archivePath, { mode: 0o600 }));
    const { manifest } = await validateAndExtractArchive(archivePath, extractedPath);
    const now = new Date();
    const stored: StoredImportPreview = {
      importId,
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + IMPORT_EXPIRY_MS).toISOString(),
      manifest,
    };
    await writeFile(path.join(directory, 'preview.json'), `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    return buildPreview(stored, extractedPath);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (error instanceof Error && error.message === 'backup_archive_too_large') {
      throw createError({ statusCode: 413, statusMessage: 'backup_archive_too_large' });
    }
    throw error;
  }
}

export async function applyStagedImport(input: {
  importId: string;
  userId: string;
  projectIds: string[];
  folderPaths?: Record<string, string>;
  confirmation: string;
}) {
  if (input.confirmation !== IMPORT_CONFIRMATION) {
    throw createError({ statusCode: 400, statusMessage: 'import_confirmation_required' });
  }
  const directory = importDirectory(input.importId);
  const stored = await readStoredPreview(directory, input.userId);
  const extractedPath = path.join(directory, 'extracted');
  await validateExtractedBackup(extractedPath, stored.manifest);
  const selectedIds = [...new Set(input.projectIds)];
  if (!selectedIds.length || selectedIds.some((id) => !stored.manifest.projects.some((project) => project.id === id))) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_import_project_selection' });
  }
  const preview = await buildPreview(stored, extractedPath);
  const selectedPreview = preview.projects.filter((project) => selectedIds.includes(project.id));
  const blocker = selectedPreview.find((project) => project.blockedReason);
  if (blocker) throw createError({ statusCode: 409, statusMessage: blocker.blockedReason! });

  const folderPaths = await resolveFolderPaths(selectedPreview, input.folderPaths ?? {});
  const workingDatabasePath = path.join(directory, 'working.sqlite');
  await copyFile(path.join(extractedPath, stored.manifest.database.archivePath), workingDatabasePath);
  const importedRoot = path.join(appDataRoot(), 'imported-files', input.importId);
  await mkdir(importedRoot, { recursive: true, mode: 0o700 });
  try {
    const working = new Database(workingDatabasePath);
    try {
      rewriteProjectFolderPaths(working, folderPaths);
      normalizeRuntimeStates(working, selectedIds);
      await materializeImportedFiles(working, stored.manifest.files, selectedIds, extractedPath, importedRoot);
    } finally {
      working.close();
    }
    preflightLiveImport(workingDatabasePath, stored.manifest, selectedIds);
    importDatabaseRows(workingDatabasePath, stored.manifest, selectedIds);
    await rm(directory, { recursive: true, force: true });
    return {
      ok: true,
      importedProjects: selectedIds.length,
      importedUsers: stored.manifest.scope.users,
      fullImport: selectedIds.length === stored.manifest.projects.length,
      reauthenticationRequired: true,
    };
  } catch (error) {
    await rm(importedRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function cancelStagedImport(importId: string, userId: string) {
  const directory = importDirectory(importId);
  await readStoredPreview(directory, userId);
  await rm(directory, { recursive: true, force: true });
  return { ok: true };
}

async function validateAndExtractArchive(archivePath: string, extractedPath: string) {
  await mkdir(extractedPath, { recursive: true, mode: 0o700 });
  const entries = await extractZip(archivePath, extractedPath);
  const manifestPath = path.join(extractedPath, 'manifest.json');
  const rawManifest = await readFile(manifestPath, 'utf8').catch(() => null);
  if (!rawManifest || rawManifest.length > 10 * 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'backup_manifest_missing' });
  }
  let manifest: BackupManifest;
  try {
    manifest = backupManifestSchema.parse(JSON.parse(rawManifest));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'backup_manifest_invalid' });
  }
  const expected = new Set(['manifest.json', manifest.database.archivePath, ...manifest.files.map((file) => file.archivePath)]);
  const unexpected = entries.find((entry) => !expected.has(entry));
  if (unexpected || expected.size !== entries.length) {
    throw createError({ statusCode: 400, statusMessage: 'backup_archive_entries_invalid' });
  }
  await validateExtractedBackup(extractedPath, manifest);
  return { manifest };
}

async function validateExtractedBackup(extractedPath: string, manifest: BackupManifest) {
  const databaseFile = path.join(extractedPath, manifest.database.archivePath);
  await verifyFile(databaseFile, manifest.database.size, manifest.database.sha256, 'backup_database_invalid');
  for (const file of manifest.files) {
    if (!validateArchivePath(file.archivePath) || !file.archivePath.startsWith('files/')) {
      throw createError({ statusCode: 400, statusMessage: 'backup_file_manifest_invalid' });
    }
    await verifyFile(path.join(extractedPath, file.archivePath), file.size, file.sha256, 'backup_file_checksum_invalid');
  }
  const source = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    const integrity = source.pragma('quick_check') as Array<{ quick_check: string }>;
    if (integrity[0]?.quick_check !== 'ok') throw createError({ statusCode: 400, statusMessage: 'backup_database_integrity_failed' });
    if (databaseSchemaFingerprint(source) !== manifest.schemaFingerprint
      || manifest.schemaFingerprint !== databaseSchemaFingerprint(sqliteDatabase)) {
      throw createError({ statusCode: 409, statusMessage: 'backup_schema_incompatible' });
    }
    const projectCount = Number((source.prepare('SELECT COUNT(*) value FROM projects').get() as { value: number }).value);
    const userCount = Number((source.prepare('SELECT COUNT(*) value FROM users').get() as { value: number }).value);
    if (projectCount !== manifest.scope.projects || userCount !== manifest.scope.users) {
      throw createError({ statusCode: 400, statusMessage: 'backup_manifest_database_mismatch' });
    }
  } finally {
    source.close();
  }
}

async function buildPreview(stored: StoredImportPreview, extractedPath: string): Promise<ImportPreviewResponse> {
  const source = new Database(path.join(extractedPath, stored.manifest.database.archivePath), { readonly: true });
  try {
    const targetProjects = sqliteDatabase.prepare('SELECT id, key, folder_path folderPath FROM projects').all() as Array<{ id: string; key: string; folderPath: string }>;
    const users = source.prepare('SELECT id, email, name, role, active FROM users ORDER BY email').all() as ImportPreviewResponse['users'];
    const activeAdmins = users.filter((user) => user.role === 'admin' && Boolean(user.active));
    const warnings = activeAdmins.length ? ['sessions_and_api_tokens_will_be_invalidated'] : ['backup_has_no_active_admin'];
    const projects = await Promise.all(stored.manifest.projects.map(async (project) => {
      const idMatch = targetProjects.find((target) => target.id === project.id);
      const keyMatch = targetProjects.find((target) => target.key === project.key);
      const ambiguous = idMatch && keyMatch && idMatch.id !== keyMatch.id;
      const effectiveFolderPath = idMatch?.folderPath ?? keyMatch?.folderPath ?? project.folderPath;
      return {
        ...project,
        action: idMatch || keyMatch ? 'replace' as const : 'create' as const,
        effectiveFolderPath,
        folderPathExists: await isDirectory(effectiveFolderPath),
        blockedReason: ambiguous ? 'import_project_identity_conflict' : null,
      };
    }));
    return { importId: stored.importId, exportedAt: stored.manifest.exportedAt, expiresAt: stored.expiresAt, scope: stored.manifest.scope, projects, users, warnings };
  } finally {
    source.close();
  }
}

async function readStoredPreview(directory: string, userId: string) {
  let stored: StoredImportPreview;
  try {
    stored = JSON.parse(await readFile(path.join(directory, 'preview.json'), 'utf8')) as StoredImportPreview;
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'import_preview_not_found' });
  }
  if (stored.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'import_preview_not_found' });
  if (stored.expiresAt <= new Date().toISOString()) {
    await rm(directory, { recursive: true, force: true });
    throw createError({ statusCode: 410, statusMessage: 'import_preview_expired' });
  }
  stored.manifest = backupManifestSchema.parse(stored.manifest);
  return stored;
}

async function resolveFolderPaths(projects: ImportProjectPreview[], overrides: Record<string, string>) {
  const result = new Map<string, string>();
  for (const project of projects) {
    const requested = overrides[project.id]?.trim() || project.effectiveFolderPath;
    const resolved = path.resolve(requested);
    if (!path.isAbsolute(requested) || !await isDirectory(resolved)) {
      throw createError({ statusCode: 400, statusMessage: 'import_project_folder_required', data: { projectId: project.id } });
    }
    result.set(project.id, resolved);
  }
  return result;
}

function rewriteProjectFolderPaths(database: Database.Database, paths: Map<string, string>) {
  const update = database.prepare('UPDATE projects SET folder_path = ? WHERE id = ?');
  const transaction = database.transaction(() => {
    for (const [projectId, folderPath] of paths) update.run(folderPath, projectId);
  });
  transaction();
}

function normalizeRuntimeStates(database: Database.Database, projectIds: string[]) {
  const placeholders = projectIds.map(() => '?').join(',');
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`UPDATE tasks SET agent_status = 'failed', updated_at = ? WHERE project_id IN (${placeholders}) AND agent_status IN ('running', 'waiting_external')`).run(now, ...projectIds);
    database.prepare(`UPDATE task_agent_runs SET status = 'cancelled', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (${placeholders})) AND status IN ('running', 'waiting_external')`).run(now, now, ...projectIds);
    database.prepare(`UPDATE task_refinements SET status = 'failed', error = 'import_interrupted', failed_at = COALESCE(failed_at, ?), lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ? WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (${placeholders})) AND status IN ('queued', 'running', 'awaiting_input')`).run(now, now, ...projectIds);
    database.prepare(`UPDATE project_chat_threads SET status = 'failed', last_error = 'chat_interrupted_by_import', updated_at = ? WHERE project_id IN (${placeholders}) AND status = 'running'`).run(now, ...projectIds);
    database.prepare(`UPDATE project_chat_messages SET state = 'failed', updated_at = ? WHERE thread_id IN (SELECT id FROM project_chat_threads WHERE project_id IN (${placeholders})) AND state = 'streaming'`).run(now, ...projectIds);
    database.prepare(`UPDATE e2e_test_runs SET status = 'cancelled', summary = 'Run interrupted by backup import.', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE project_id IN (${placeholders}) AND status IN ('queued', 'running')`).run(now, now, ...projectIds);
    database.prepare(`UPDATE project_chat_voice_jobs SET status = 'cancelled', updated_at = ? WHERE thread_id IN (SELECT id FROM project_chat_threads WHERE project_id IN (${placeholders})) AND status IN ('queued', 'running')`).run(now, ...projectIds);
    database.prepare(`UPDATE project_chat_voice_commands SET status = 'cancelled', updated_at = ? WHERE thread_id IN (SELECT id FROM project_chat_threads WHERE project_id IN (${placeholders})) AND status IN ('pending_confirmation', 'queued', 'dispatched')`).run(now, ...projectIds);
  })();
}

async function materializeImportedFiles(
  database: Database.Database,
  files: BackupFile[],
  selectedIds: string[],
  extractedPath: string,
  importedRoot: string,
) {
  for (const file of files.filter((candidate) => selectedIds.includes(candidate.projectId))) {
    const relative = file.archivePath.slice('files/'.length);
    const destination = path.join(importedRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(extractedPath, file.archivePath), destination);
    if (file.locator.type === 'column') {
      const { table, idColumn } = columnTarget(file.locator.table);
      database.prepare(`UPDATE ${table} SET ${file.locator.column} = ? WHERE ${idColumn} = ?`).run(destination, file.locator.rowId);
    } else if (file.locator.type === 'chat_attachment') {
      const locator = file.locator;
      const row = database.prepare('SELECT attachments_json value FROM project_chat_messages WHERE id = ?').get(file.locator.messageId) as { value: string } | undefined;
      if (!row) throw createError({ statusCode: 400, statusMessage: 'backup_file_locator_invalid' });
      const attachments = JSON.parse(row.value) as Array<Record<string, unknown>>;
      const attachment = attachments.find((candidate) => candidate.id === locator.attachmentId);
      if (!attachment) throw createError({ statusCode: 400, statusMessage: 'backup_file_locator_invalid' });
      attachment.storagePath = destination;
      database.prepare('UPDATE project_chat_messages SET attachments_json = ? WHERE id = ?').run(JSON.stringify(attachments), file.locator.messageId);
    } else {
      const row = database.prepare('SELECT content FROM project_chat_messages WHERE id = ?').get(file.locator.messageId) as { content: string } | undefined;
      if (!row?.content.includes(file.locator.sourceUrl)) throw createError({ statusCode: 400, statusMessage: 'backup_file_locator_invalid' });
      const replacement = file.locator.sourceUrl.replace(/[^/]+$/, Buffer.from(destination).toString('base64url'));
      database.prepare('UPDATE project_chat_messages SET content = replace(content, ?, ?) WHERE id = ?').run(file.locator.sourceUrl, replacement, file.locator.messageId);
    }
  }
}

function columnTarget(table: Extract<BackupFile['locator'], { type: 'column' }>['table']) {
  if (table === 'attachment_annotations') return { table, idColumn: 'attachment_id' };
  return { table, idColumn: 'id' };
}

function preflightLiveImport(sourcePath: string, manifest: BackupManifest, projectIds: string[]) {
  const source = new Database(sourcePath, { readonly: true });
  try {
    const admins = Number((source.prepare(`SELECT COUNT(*) value FROM users WHERE role = 'admin' AND active = 1`).get() as { value: number }).value);
    if (!admins) throw createError({ statusCode: 409, statusMessage: 'backup_has_no_active_admin' });
    const fullImport = projectIds.length === manifest.projects.length;
    if (!fullImport) {
      const targetUsers = sqliteDatabase.prepare('SELECT id, email FROM users').all() as Array<{ id: string; email: string }>;
      const sourceUsers = source.prepare('SELECT id, email FROM users').all() as Array<{ id: string; email: string }>;
      const conflict = sourceUsers.find((user) => targetUsers.some((target) => target.email.toLowerCase() === user.email.toLowerCase() && target.id !== user.id));
      if (conflict) throw createError({ statusCode: 409, statusMessage: 'import_user_email_conflict', data: { email: conflict.email } });

      const selectedKeys = manifest.projects.filter((project) => projectIds.includes(project.id)).map((project) => project.key);
      const placeholders = projectIds.map(() => '?').join(',');
      const keyPlaceholders = selectedKeys.map(() => '?').join(',');
      const importedTaskKeys = source.prepare(`SELECT key FROM tasks WHERE project_id IN (${placeholders})`).all(...projectIds) as Array<{ key: string }>;
      if (importedTaskKeys.length) {
        const taskPlaceholders = importedTaskKeys.map(() => '?').join(',');
        const conflictTask = sqliteDatabase.prepare(`
          SELECT t.key FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE t.key IN (${taskPlaceholders}) AND p.id NOT IN (${placeholders}) AND p.key NOT IN (${keyPlaceholders}) LIMIT 1
        `).get(...importedTaskKeys.map((row) => row.key), ...projectIds, ...selectedKeys);
        if (conflictTask) throw createError({ statusCode: 409, statusMessage: 'import_task_key_conflict' });
      }
    }
  } finally {
    source.close();
  }
}

function importDatabaseRows(sourcePath: string, manifest: BackupManifest, projectIds: string[]) {
  const fullImport = projectIds.length === manifest.projects.length;
  sqliteDatabase.prepare('ATTACH DATABASE ? AS backup_import').run(sourcePath);
  try {
    sqliteDatabase.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON; CREATE TEMP TABLE selected_import_projects (id TEXT PRIMARY KEY);');
    try {
      const addProject = sqliteDatabase.prepare('INSERT INTO selected_import_projects (id) VALUES (?)');
      for (const projectId of projectIds) addProject.run(projectId);
      sqliteDatabase.exec('DELETE FROM sessions; DELETE FROM api_tokens;');
      if (fullImport) {
        sqliteDatabase.exec('DELETE FROM projects; DELETE FROM project_chat_preferences; DELETE FROM users;');
      }
      upsertUsersFromAttachedDatabase();
      sqliteDatabase.exec(`
        DELETE FROM project_chat_preferences WHERE user_id IN (SELECT id FROM backup_import.users);
        INSERT INTO project_chat_preferences SELECT * FROM backup_import.project_chat_preferences;
      `);
      if (!fullImport) {
        sqliteDatabase.exec(`
          DELETE FROM projects
          WHERE id IN (SELECT id FROM selected_import_projects)
             OR key IN (SELECT key FROM backup_import.projects WHERE id IN (SELECT id FROM selected_import_projects));
        `);
      }
      for (const step of COPY_STEPS) copyRows(step.table, step.where, step.columns);
      const foreignKeyErrors = sqliteDatabase.pragma('foreign_key_check') as unknown[];
      if (foreignKeyErrors.length) throw new Error('import_foreign_key_check_failed');
      sqliteDatabase.exec('DROP TABLE selected_import_projects; COMMIT;');
    } catch (error) {
      sqliteDatabase.exec('ROLLBACK;');
      throw error;
    }
  } finally {
    sqliteDatabase.exec('DETACH DATABASE backup_import;');
  }
}

function upsertUsersFromAttachedDatabase() {
  const sourceUsers = sqliteDatabase.prepare('SELECT * FROM backup_import.users').all() as Array<Record<string, unknown>>;
  const columns = tableColumns('users');
  const quoted = columns.map(quoteIdentifier).join(', ');
  const values = columns.map(() => '?').join(', ');
  const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(', ');
  const statement = sqliteDatabase.prepare(`INSERT INTO users (${quoted}) VALUES (${values}) ON CONFLICT(id) DO UPDATE SET ${updates}`);
  for (const user of sourceUsers) statement.run(...columns.map((column) => user[column]));
}

function copyRows(table: string, where: string, selectedColumns?: string[]) {
  const columns = selectedColumns ?? tableColumns(table);
  const quoted = columns.map(quoteIdentifier).join(', ');
  sqliteDatabase.exec(`INSERT INTO ${quoteIdentifier(table)} (${quoted}) SELECT ${quoted} FROM backup_import.${quoteIdentifier(table)} WHERE ${where};`);
}

function tableColumns(table: string) {
  return (sqliteDatabase.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function quoteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('invalid_sql_identifier');
  return `"${value}"`;
}

const SELECTED = 'SELECT id FROM selected_import_projects';
const COPY_STEPS: Array<{ table: string; where: string; columns?: string[] }> = [
  { table: 'projects', where: `id IN (${SELECTED})` },
  { table: 'project_harness_limits', where: `project_id IN (${SELECTED})` },
  { table: 'project_users', where: `project_id IN (${SELECTED})` },
  { table: 'project_tags', where: `project_id IN (${SELECTED})` },
  { table: 'columns', where: `project_id IN (${SELECTED})` },
  { table: 'oberthemen', where: `project_id IN (${SELECTED})` },
  { table: 'unterthemen', where: `oberthema_id IN (SELECT id FROM backup_import.oberthemen WHERE project_id IN (${SELECTED}))` },
  { table: 'swimlanes', where: `project_id IN (${SELECTED})` },
  { table: 'wiki_pages', where: `project_id IN (${SELECTED})` },
  { table: 'wiki_todo_lists', where: `project_id IN (${SELECTED})` },
  { table: 'wiki_todo_items', where: `list_id IN (SELECT id FROM backup_import.wiki_todo_lists WHERE project_id IN (${SELECTED}))` },
  { table: 'wiki_images', where: `page_id IN (SELECT id FROM backup_import.wiki_pages WHERE project_id IN (${SELECTED}))` },
  { table: 'tasks', where: `project_id IN (${SELECTED})` },
  { table: 'e2e_test_suites', where: `project_id IN (${SELECTED})` },
  { table: 'e2e_test_cases', where: `project_id IN (${SELECTED})` },
  { table: 'e2e_test_case_assets', where: `case_id IN (SELECT id FROM backup_import.e2e_test_cases WHERE project_id IN (${SELECTED}))` },
  { table: 'e2e_test_runs', where: `project_id IN (${SELECTED})` },
  { table: 'e2e_test_run_artifacts', where: `run_id IN (SELECT id FROM backup_import.e2e_test_runs WHERE project_id IN (${SELECTED}))` },
  { table: 'task_agent_runs', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'task_refinements', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'task_refinement_comments', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'task_refinement_visual_comments', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'task_refinement_artifacts', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'attachments', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'task_tags', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'attachment_annotations', where: `attachment_id IN (SELECT a.id FROM backup_import.attachments a JOIN backup_import.tasks t ON t.id = a.task_id WHERE t.project_id IN (${SELECTED}))` },
  { table: 'comments', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'comment_mentions', where: `task_id IN (SELECT id FROM backup_import.tasks WHERE project_id IN (${SELECTED}))` },
  { table: 'project_chat_threads', where: `project_id IN (${SELECTED})` },
  { table: 'project_chat_messages', where: `thread_id IN (SELECT id FROM backup_import.project_chat_threads WHERE project_id IN (${SELECTED}))` },
  { table: 'project_chat_events', where: `thread_id IN (SELECT id FROM backup_import.project_chat_threads WHERE project_id IN (${SELECTED}))`, columns: ['thread_id', 'type', 'payload', 'created_at'] },
  { table: 'project_chat_voice_commands', where: `thread_id IN (SELECT id FROM backup_import.project_chat_threads WHERE project_id IN (${SELECTED}))` },
  { table: 'project_chat_voice_jobs', where: `thread_id IN (SELECT id FROM backup_import.project_chat_threads WHERE project_id IN (${SELECTED}))` },
  { table: 'activity', where: `project_id IN (${SELECTED})` },
];

async function extractZip(archivePath: string, destination: string) {
  const zip = await openZip(archivePath);
  const files: string[] = [];
  let entryCount = 0;
  let uncompressed = 0;
  return await new Promise<string[]>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(isHttpError(error) ? error : createError({ statusCode: 400, statusMessage: 'backup_archive_invalid' }));
    };
    zip.once('error', fail);
    zip.once('end', () => {
      if (settled) return;
      settled = true;
      zip.close();
      resolve(files);
    });
    zip.on('entry', async (entry: Entry) => {
      try {
        entryCount += 1;
        uncompressed += entry.uncompressedSize;
        if (entryCount > MAX_ENTRIES || uncompressed > positiveLimit(process.env.KANBAN_BACKUP_MAX_UNCOMPRESSED_BYTES, MAX_UNCOMPRESSED_BYTES)) {
          throw createError({ statusCode: 413, statusMessage: 'backup_archive_expanded_too_large' });
        }
        if (!validateArchivePath(entry.fileName) || isSymlink(entry)) {
          throw createError({ statusCode: 400, statusMessage: 'backup_archive_path_invalid' });
        }
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        const target = path.join(destination, entry.fileName);
        await mkdir(path.dirname(target), { recursive: true });
        const input = await openEntry(zip, entry);
        await pipeline(input, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
        files.push(entry.fileName);
        zip.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zip.readEntry();
  });
}

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, validateEntrySizes: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(createError({ statusCode: 400, statusMessage: 'backup_archive_invalid' }));
      else resolve(zip);
    });
  });
}

function openEntry(zip: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(createError({ statusCode: 400, statusMessage: 'backup_archive_invalid' }));
      else resolve(stream);
    });
  });
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error);
}

function isSymlink(entry: Entry) {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}

async function verifyFile(filePath: string, expectedSize: number, expectedHash: string, message: string) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size !== expectedSize) throw createError({ statusCode: 400, statusMessage: message });
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  if (hash.digest('hex') !== expectedHash) throw createError({ statusCode: 400, statusMessage: message });
}

async function cleanupExpiredImports() {
  const parent = path.dirname(appDataDir('backup-staging', '.keep'));
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('import-')).map(async (entry) => {
    const directory = path.join(parent, entry.name);
    const metadata = await stat(directory).catch(() => null);
    if (metadata && now - metadata.mtimeMs > IMPORT_EXPIRY_MS) await rm(directory, { recursive: true, force: true });
  }));
}

function importDirectory(importId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(importId)) throw createError({ statusCode: 404, statusMessage: 'import_preview_not_found' });
  return path.join(path.dirname(appDataDir('backup-staging', '.keep')), `import-${importId}`);
}

async function isDirectory(value: string) {
  return (await stat(value).catch(() => null))?.isDirectory() ?? false;
}

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
