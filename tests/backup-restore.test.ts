import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-backup-restore-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'backup-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'backup-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let backupExport: typeof import('../server/lib/backup/export');
let backupImport: typeof import('../server/lib/backup/import');
let s3: typeof import('../server/lib/backup/s3');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  backupExport = await import('../server/lib/backup/export');
  backupImport = await import('../server/lib/backup/import');
  s3 = await import('../server/lib/backup/s3');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('complete backup and restore', () => {
  test('creates a portable package and restores selected project data and files', async () => {
    const workspace = path.join(testRoot, 'workspace');
    const project = await kanban.createProject({ name: 'Backup Project', key: 'BACKUP', folderPath: workspace }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Original title',
      description: 'State before mutation',
      files: [{ fileName: 'evidence.txt', mimeType: 'text/plain', data: Buffer.from('backup evidence') }],
    }, admin);
    if (!task) throw new Error('task_missing');

    const created = await backupExport.createBackupArchive();
    const archiveBytes = readFileSync(created.path);
    const archive = unzipSync(archiveBytes);
    expect(Object.keys(archive)).toContain('manifest.json');
    expect(Object.keys(archive)).toContain('database/kanban.sqlite');
    const manifest = JSON.parse(strFromU8(archive['manifest.json']!));
    expect(manifest).toMatchObject({ format: 'agent-kanban-backup', formatVersion: 1 });
    expect(manifest.scope).toMatchObject({ projects: 1, tasks: 1, users: 1, files: 1 });
    expect(JSON.stringify(manifest)).not.toContain(path.join(testRoot, 'data', 'uploads'));

    await kanban.updateTask(task.id, { title: 'Mutated title' }, admin);
    dbModule.db.update(dbModule.schema.users).set({ email: 'temporary-admin@example.com' })
      .where(eq(dbModule.schema.users.id, admin.id)).run();
    dbModule.db.insert(dbModule.schema.users).values({
      ...admin,
      id: 'target-user-with-conflicting-email',
      email: admin.email,
    }).run();
    const preview = await backupImport.stageImportArchive(createReadStream(created.path), admin.id, archiveBytes.byteLength);
    expect(preview.projects).toEqual([expect.objectContaining({ id: project.id, action: 'replace', folderPathExists: true })]);
    expect(preview.users).toEqual([expect.objectContaining({ id: admin.id, email: admin.email })]);

    const result = await backupImport.applyStagedImport({
      importId: preview.importId,
      userId: admin.id,
      projectIds: [project.id],
      folderPaths: { [project.id]: workspace },
      confirmation: 'IMPORT',
    });
    expect(result).toMatchObject({ ok: true, importedProjects: 1, importedUsers: 1, fullImport: true });
    expect(dbModule.db.select().from(dbModule.schema.tasks).where(eq(dbModule.schema.tasks.id, task.id)).get()?.title).toBe('Original title');
    const attachment = dbModule.db.select().from(dbModule.schema.attachments).where(eq(dbModule.schema.attachments.taskId, task.id)).get();
    expect(attachment).toBeTruthy();
    expect(attachment?.storagePath).toContain(path.join('imported-files', preview.importId));
    expect(existsSync(attachment!.storagePath)).toBe(true);
    expect(readFileSync(attachment!.storagePath, 'utf8')).toBe('backup evidence');
    expect(dbModule.db.select().from(dbModule.schema.sessions).all()).toEqual([]);
    expect(dbModule.db.select().from(dbModule.schema.apiTokens).all()).toEqual([]);
    expect(dbModule.db.select().from(dbModule.schema.users).all()).toEqual([expect.objectContaining({ id: admin.id, email: admin.email })]);
    await created.cleanup();
  });

  test('rejects changed package files before previewing any import', async () => {
    const created = await backupExport.createBackupArchive();
    const files = unzipSync(readFileSync(created.path));
    const attachmentName = Object.keys(files).find((name) => name.startsWith('files/'))!;
    files[attachmentName]![0] = files[attachmentName]![0]! ^ 0xff;
    const { zipSync } = await import('fflate');
    const changedPath = path.join(testRoot, 'changed.zip');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(changedPath, zipSync(files));
    await expect(backupImport.stageImportArchive(createReadStream(changedPath), admin.id))
      .rejects.toMatchObject({ statusMessage: 'backup_file_checksum_invalid' });
    await created.cleanup();
  });

  test('rejects malformed ZIP uploads as a client error', async () => {
    const changedPath = path.join(testRoot, 'not-a-backup.zip');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(changedPath, 'not a zip');
    await expect(backupImport.stageImportArchive(createReadStream(changedPath), admin.id))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'backup_archive_invalid' });
  });
});

describe('S3 backup retention', () => {
  test('keeps the configured newest backup count and ignores unrelated objects', async () => {
    const sent: unknown[] = [];
    const client = {
      send: vi.fn(async (command: unknown) => {
        sent.push(command);
        if (command instanceof ListObjectsV2Command) {
          return {
            Contents: [
              object('backups/agent-kanban-backup-2026-09-08_12-00-00-000Z.zip', 4),
              object('backups/agent-kanban-backup-2026-09-07_12-00-00-000Z.zip', 3),
              object('backups/agent-kanban-backup-2026-09-06_12-00-00-000Z.zip', 2),
              object('backups/agent-kanban-backup-2026-09-05_12-00-00-000Z.zip', 1),
              object('backups/manual-file.zip', 0),
              object('elsewhere/agent-kanban-backup-2026-09-01_12-00-00-000Z.zip', 0),
            ],
          };
        }
        return {};
      }),
    } as unknown as S3Client;

    const deleted = await s3.rotateBackups(client, {
      bucket: 'bucket', prefix: 'backups', forcePathStyle: false, retentionCount: 3,
    }, 'backups/agent-kanban-backup-2026-09-08_12-00-00-000Z.zip');
    expect(deleted).toBe(1);
    const deletion = sent.find((command) => command instanceof DeleteObjectsCommand) as DeleteObjectsCommand;
    expect(deletion.input.Delete?.Objects).toEqual([{ Key: 'backups/agent-kanban-backup-2026-09-05_12-00-00-000Z.zip' }]);
  });

  test('defaults retention to 30 and accepts an explicit limit', () => {
    expect(s3.backupS3Config({ KANBAN_BACKUP_S3_BUCKET: 'bucket' })?.retentionCount).toBe(30);
    expect(s3.backupS3Config({ KANBAN_BACKUP_S3_BUCKET: 'bucket', KANBAN_BACKUP_S3_RETENTION_COUNT: '12' })?.retentionCount).toBe(12);
  });
});

function object(key: string, day: number) {
  return { Key: key, LastModified: new Date(Date.UTC(2026, 8, day || 1)) };
}
