import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import Database from 'better-sqlite3';
import { appDataDir, appDataRoot, db, schema, snapshotDatabase, sqliteDatabase } from '../db';
import { count } from 'drizzle-orm';
import { backupFileName, databaseSchemaFingerprint, type BackupManifest } from './format';
import { buildFileInventory } from './inventory';

export interface CreatedBackupArchive {
  path: string;
  fileName: string;
  manifest: BackupManifest;
  cleanup: () => Promise<void>;
}

export async function createBackupArchive(outputPath?: string): Promise<CreatedBackupArchive> {
  const stagingParent = path.dirname(appDataDir('backup-staging', '.keep'));
  const stagingDir = await mkdtemp(path.join(stagingParent, 'export-'));
  const snapshotPath = path.join(stagingDir, 'kanban.sqlite');
  const exportedAt = new Date().toISOString();
  const archivePath = outputPath ?? path.join(stagingDir, backupFileName(exportedAt));
  try {
    if (outputPath) await mkdir(path.dirname(outputPath), { recursive: true });
    await snapshotDatabase(snapshotPath);
    const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    let manifest: BackupManifest;
    let inventory;
    try {
      const integrity = snapshot.pragma('quick_check') as Array<{ quick_check: string }>;
      if (integrity[0]?.quick_check !== 'ok') throw new Error('backup_snapshot_integrity_failed');
      inventory = await buildFileInventory(snapshot);
      const projects = snapshot.prepare(`
        SELECT p.id, p.key, p.name, p.folder_path folderPath, COUNT(t.id) taskCount
        FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id ORDER BY p.key
      `).all() as Array<{ id: string; key: string; name: string; folderPath: string; taskCount: number }>;
      const snapshotStat = await stat(snapshotPath);
      const publicFiles = inventory.map(({ storagePath: _storagePath, ...file }) => file);
      manifest = {
        format: 'agent-kanban-backup',
        formatVersion: 1,
        exportedAt,
        schemaFingerprint: databaseSchemaFingerprint(snapshot),
        database: {
          archivePath: 'database/kanban.sqlite',
          size: snapshotStat.size,
          sha256: await hashFile(snapshotPath),
        },
        scope: {
          users: Number((snapshot.prepare('SELECT COUNT(*) value FROM users').get() as { value: number }).value),
          projects: projects.length,
          tasks: Number((snapshot.prepare('SELECT COUNT(*) value FROM tasks').get() as { value: number }).value),
          files: publicFiles.length,
          totalFileBytes: publicFiles.reduce((sum, file) => sum + file.size, 0),
        },
        projects: projects.map((project) => {
          const projectFiles = publicFiles.filter((file) => file.projectId === project.id);
          return {
            ...project,
            taskCount: Number(project.taskCount),
            fileCount: projectFiles.length,
            fileBytes: projectFiles.reduce((sum, file) => sum + file.size, 0),
          };
        }),
        files: publicFiles,
      };
    } finally {
      snapshot.close();
    }
    await writeArchive(archivePath, snapshotPath, manifest, inventory);
    return {
      path: archivePath,
      fileName: backupFileName(exportedAt),
      manifest,
      cleanup: () => rm(stagingDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    if (outputPath) await rm(outputPath, { force: true });
    throw error;
  }
}

export function currentBackupScope() {
  const files = [
    schema.attachments,
    schema.taskRefinementArtifacts,
    schema.e2eTestCaseAssets,
    schema.e2eTestRunArtifacts,
    schema.wikiImages,
  ].reduce((total, table) => total + Number(db.select({ value: count() }).from(table).get()?.value ?? 0), 0);
  const totalFileBytes = Number((sqliteDatabase.prepare(`
    SELECT COALESCE(SUM(size), 0) value FROM (
      SELECT size FROM attachments
      UNION ALL SELECT size FROM task_refinement_artifacts
      UNION ALL SELECT size FROM e2e_test_case_assets
      UNION ALL SELECT size FROM e2e_test_run_artifacts
      UNION ALL SELECT size FROM wiki_images
    )
  `).get() as { value: number } | undefined)?.value ?? 0);
  return {
    users: Number(db.select({ value: count() }).from(schema.users).get()?.value ?? 0),
    projects: Number(db.select({ value: count() }).from(schema.projects).get()?.value ?? 0),
    tasks: Number(db.select({ value: count() }).from(schema.tasks).get()?.value ?? 0),
    files,
    totalFileBytes,
    schemaFingerprint: databaseSchemaFingerprint(sqliteDatabase),
    dataRoot: appDataRoot(),
  };
}

async function writeArchive(
  archivePath: string,
  snapshotPath: string,
  manifest: BackupManifest,
  files: Awaited<ReturnType<typeof buildFileInventory>>,
) {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = createWriteStream(archivePath, { mode: 0o600 });
  const completed = new Promise<void>((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
  });
  archive.pipe(output);
  const archiveDate = new Date(manifest.exportedAt);
  archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: 'manifest.json', date: archiveDate });
  archive.file(snapshotPath, { name: manifest.database.archivePath, date: archiveDate });
  for (const file of files) archive.file(file.storagePath, { name: file.archivePath, date: archiveDate });
  await archive.finalize();
  await completed;
}

async function hashFile(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
