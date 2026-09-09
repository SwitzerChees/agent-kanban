import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
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
let backupSettings: typeof import('../server/lib/backup/settings');
let backupScheduler: typeof import('../server/lib/backup/scheduler');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  backupExport = await import('../server/lib/backup/export');
  backupImport = await import('../server/lib/backup/import');
  s3 = await import('../server/lib/backup/s3');
  backupSettings = await import('../server/lib/backup/settings');
  backupScheduler = await import('../server/lib/backup/scheduler');
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

  test('turns common S3 connection failures into actionable API errors', () => {
    expect(s3.s3ConnectionError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, {
      endpoint: 'https://s3.example.test', forcePathStyle: false,
    })).toMatchObject({ statusCode: 400, statusMessage: 'backup_s3_virtual_host_tls_failed' });
    expect(s3.s3ConnectionError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }, {
      endpoint: 'https://s3.example.test', forcePathStyle: true,
    })).toMatchObject({ statusCode: 403, statusMessage: 'backup_s3_access_denied' });
    expect(s3.s3ConnectionError({ code: 'ENOTFOUND' }, {
      endpoint: 'https://missing.example.test', forcePathStyle: true,
    })).toMatchObject({ statusCode: 502, statusMessage: 'backup_s3_endpoint_unreachable' });
  });

  test('also removes managed backups older than the configured retention days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const sent: unknown[] = [];
    const client = {
      send: vi.fn(async (command: unknown) => {
        sent.push(command);
        if (command instanceof ListObjectsV2Command) {
          return {
            Contents: [
              object('daily/agent-kanban-backup-2026-09-09_10-00-00-000Z.zip', 9),
              object('daily/agent-kanban-backup-2026-09-08_10-00-00-000Z.zip', 8),
              object('daily/agent-kanban-backup-2026-09-05_10-00-00-000Z.zip', 5),
            ],
          };
        }
        return {};
      }),
    } as unknown as S3Client;
    try {
      const deleted = await s3.rotateBackups(client, {
        bucket: 'bucket', prefix: 'daily', forcePathStyle: false, retentionCount: 100, retentionDays: 2,
      }, 'daily/agent-kanban-backup-2026-09-09_10-00-00-000Z.zip');
      expect(deleted).toBe(1);
      const deletion = sent.find((command) => command instanceof DeleteObjectsCommand) as DeleteObjectsCommand;
      expect(deletion.input.Delete?.Objects).toEqual([{ Key: 'daily/agent-kanban-backup-2026-09-05_10-00-00-000Z.zip' }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('UI-managed backup configuration', () => {
  test('stores credentials encrypted outside SQLite and never returns them publicly', async () => {
    const destination = backupSettings.createBackupDestination(backupSettings.destinationInputSchema.parse({
      name: 'Offsite storage',
      bucket: 'agent-kanban-test',
      endpoint: 'https://s3.example.test',
      region: 'eu-test-1',
      prefix: 'backups',
      forcePathStyle: true,
      serverSideEncryption: 'AES256',
      accessKeyId: 'AK_TEST_ONLY_NOT_REAL',
      secretAccessKey: 'SECRET_TEST_ONLY_NOT_REAL',
    }));

    expect(JSON.stringify(destination)).not.toContain('AK_TEST_ONLY_NOT_REAL');
    expect(JSON.stringify(backupSettings.listBackupDestinations())).not.toContain('SECRET_TEST_ONLY_NOT_REAL');
    expect(backupSettings.backupDestinationConfig(destination.id)).toMatchObject({
      accessKeyId: 'AK_TEST_ONLY_NOT_REAL',
      secretAccessKey: 'SECRET_TEST_ONLY_NOT_REAL',
    });

    const keyPath = path.join(process.env.KANBAN_DATA_DIR!, 'secrets', 'backup-config.key');
    const credentialPath = path.join(process.env.KANBAN_DATA_DIR!, 'secrets', 'backup-destinations', `${destination.id}.json`);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(statSync(credentialPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(credentialPath, 'utf8')).not.toContain('SECRET_TEST_ONLY_NOT_REAL');

    const created = await backupExport.createBackupArchive();
    const archive = unzipSync(readFileSync(created.path));
    expect(Object.keys(archive).some((name) => name.includes('secret') || name.includes('backup-config.key'))).toBe(false);
    await created.cleanup();
  });

  test('validates five-field cron expressions and persists the calculated next run', () => {
    expect(backupScheduler.nextBackupRun(
      '17 */12 * * *',
      'Europe/Zurich',
      new Date('2026-09-09T08:00:00Z'),
    )).toBe('2026-09-09T10:17:00.000Z');
    expect(() => backupScheduler.nextBackupRun('0 0 0 * * *', 'Europe/Zurich'))
      .toThrowError(expect.objectContaining({ statusMessage: 'backup_cron_invalid' }));

    const destination = backupSettings.listBackupDestinations()[0]!;
    const input = backupSettings.scheduleInputSchema.parse({
      name: 'Twice daily',
      cronExpression: '17 */12 * * *',
      timezone: 'Europe/Zurich',
      destinationId: destination.id,
      destinationDirectory: '/scheduled/daily/',
      retentionDays: 28,
      retentionCount: 30,
      enabled: true,
    });
    const schedule = backupSettings.insertBackupSchedule(
      input,
      backupScheduler.nextBackupRun(input.cronExpression, input.timezone),
    );
    expect(schedule).toMatchObject({
      destinationDirectory: 'scheduled/daily',
      retentionDays: 28,
      retentionCount: 30,
      enabled: true,
    });
    expect(schedule.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

function object(key: string, day: number) {
  return { Key: key, LastModified: new Date(Date.UTC(2026, 8, day || 1)) };
}
