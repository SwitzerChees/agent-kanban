import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createError } from 'h3';
import { z } from 'zod';
import { appDataRoot, sqliteDatabase } from '../db';
import type { BackupS3Config } from './s3';

const destinationFields = {
  name: z.string().trim().min(1).max(80),
  bucket: z.string().trim().min(1).max(255),
  endpoint: z.union([z.string().trim().url(), z.literal('')]).optional().default(''),
  region: z.string().trim().min(1).max(100),
  prefix: z.string().trim().max(500).optional().default(''),
  forcePathStyle: z.boolean().optional().default(false),
  serverSideEncryption: z.enum(['', 'AES256', 'aws:kms']).optional().default(''),
  kmsKeyId: z.string().trim().max(2048).optional().default(''),
  accessKeyId: z.string().trim().max(512).optional(),
  secretAccessKey: z.string().max(4096).optional(),
  clearCredentials: z.boolean().optional().default(false),
};

export const destinationInputSchema = z.object(destinationFields).strict().superRefine((value, context) => {
  if (Boolean(value.accessKeyId) !== Boolean(value.secretAccessKey)) {
    context.addIssue({ code: 'custom', message: 'backup_s3_credentials_incomplete' });
  }
  if (value.serverSideEncryption === 'aws:kms' && !value.kmsKeyId) {
    context.addIssue({ code: 'custom', path: ['kmsKeyId'], message: 'backup_s3_kms_key_required' });
  }
});

export const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  cronExpression: z.string().trim().min(1).max(160),
  timezone: z.string().trim().min(1).max(100),
  destinationId: z.string().uuid(),
  destinationDirectory: z.string().trim().max(500).optional().default(''),
  retentionCount: z.number().int().min(1).max(10_000),
  retentionDays: z.number().int().min(1).max(36_500),
  enabled: z.boolean().optional().default(true),
}).strict();

interface DestinationRow {
  id: string;
  name: string;
  bucket: string;
  endpoint: string | null;
  region: string;
  prefix: string;
  forcePathStyle: number;
  serverSideEncryption: '' | 'AES256' | 'aws:kms' | null;
  kmsKeyId: string | null;
  credentialsConfigured: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupDestination {
  id: string;
  name: string;
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
  forcePathStyle: boolean;
  serverSideEncryption: '' | 'AES256' | 'aws:kms';
  kmsKeyId: string;
  credentialsConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSchedule {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  destinationId: string;
  destinationName: string;
  destinationDirectory: string;
  retentionCount: number;
  retentionDays: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: 'running' | 'success' | 'failed' | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

type DestinationInput = z.infer<typeof destinationInputSchema>;

export function listBackupDestinations(): BackupDestination[] {
  const rows = sqliteDatabase.prepare(`
    SELECT id, name, bucket, endpoint, region, prefix,
      force_path_style forcePathStyle, server_side_encryption serverSideEncryption,
      kms_key_id kmsKeyId, credentials_configured credentialsConfigured,
      created_at createdAt, updated_at updatedAt
    FROM backup_s3_destinations ORDER BY name COLLATE NOCASE
  `).all() as DestinationRow[];
  return rows.map(publicDestination);
}

export function getBackupDestination(id: string): BackupDestination | null {
  const row = sqliteDatabase.prepare(`
    SELECT id, name, bucket, endpoint, region, prefix,
      force_path_style forcePathStyle, server_side_encryption serverSideEncryption,
      kms_key_id kmsKeyId, credentials_configured credentialsConfigured,
      created_at createdAt, updated_at updatedAt
    FROM backup_s3_destinations WHERE id = ?
  `).get(id) as DestinationRow | undefined;
  return row ? publicDestination(row) : null;
}

export function createBackupDestination(input: DestinationInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const hasCredentials = Boolean(input.accessKeyId && input.secretAccessKey);
  try {
    sqliteDatabase.transaction(() => {
      sqliteDatabase.prepare(`
        INSERT INTO backup_s3_destinations (
          id, name, bucket, endpoint, region, prefix, force_path_style,
          server_side_encryption, kms_key_id, credentials_configured, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.name, input.bucket, emptyToNull(input.endpoint), input.region, cleanPrefix(input.prefix),
        input.forcePathStyle ? 1 : 0, emptyToNull(input.serverSideEncryption), emptyToNull(input.kmsKeyId),
        hasCredentials ? 1 : 0, now, now,
      );
      if (hasCredentials) writeCredentials(id, input.accessKeyId!, input.secretAccessKey!);
    })();
  } catch (error) {
    deleteCredentials(id);
    throw normalizeDatabaseError(error);
  }
  return getBackupDestination(id)!;
}

export function updateBackupDestination(id: string, input: DestinationInput) {
  const current = getBackupDestination(id);
  if (!current) throw createError({ statusCode: 404, statusMessage: 'backup_destination_not_found' });
  const replacingCredentials = Boolean(input.accessKeyId && input.secretAccessKey);
  const configured = replacingCredentials ? true : input.clearCredentials ? false : current.credentialsConfigured;
  try {
    sqliteDatabase.transaction(() => {
      sqliteDatabase.prepare(`
        UPDATE backup_s3_destinations SET
          name = ?, bucket = ?, endpoint = ?, region = ?, prefix = ?, force_path_style = ?,
          server_side_encryption = ?, kms_key_id = ?, credentials_configured = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.name, input.bucket, emptyToNull(input.endpoint), input.region, cleanPrefix(input.prefix),
        input.forcePathStyle ? 1 : 0, emptyToNull(input.serverSideEncryption), emptyToNull(input.kmsKeyId),
        configured ? 1 : 0, new Date().toISOString(), id,
      );
      if (input.clearCredentials && !replacingCredentials) deleteCredentials(id);
      if (replacingCredentials) writeCredentials(id, input.accessKeyId!, input.secretAccessKey!);
    })();
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
  return getBackupDestination(id)!;
}

export function deleteBackupDestination(id: string) {
  try {
    const result = sqliteDatabase.prepare('DELETE FROM backup_s3_destinations WHERE id = ?').run(id);
    if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'backup_destination_not_found' });
    deleteCredentials(id);
  } catch (error) {
    if (String(error).includes('FOREIGN KEY constraint failed')) {
      throw createError({ statusCode: 409, statusMessage: 'backup_destination_in_use' });
    }
    throw error;
  }
  return { ok: true };
}

export function backupDestinationConfig(id: string): BackupS3Config {
  const destination = getBackupDestination(id);
  if (!destination) throw createError({ statusCode: 404, statusMessage: 'backup_destination_not_found' });
  const credentials = destination.credentialsConfigured ? readCredentials(id) : null;
  return {
    bucket: destination.bucket,
    prefix: destination.prefix,
    endpoint: destination.endpoint || undefined,
    region: destination.region,
    forcePathStyle: destination.forcePathStyle,
    serverSideEncryption: destination.serverSideEncryption || undefined,
    kmsKeyId: destination.kmsKeyId || undefined,
    accessKeyId: credentials?.accessKeyId,
    secretAccessKey: credentials?.secretAccessKey,
    retentionCount: 30,
  };
}

export function listBackupSchedules(): BackupSchedule[] {
  const rows = sqliteDatabase.prepare(`
    SELECT s.id, s.name, s.cron_expression cronExpression, s.timezone,
      s.destination_id destinationId, d.name destinationName,
      s.destination_directory destinationDirectory, s.retention_count retentionCount,
      s.retention_days retentionDays, s.enabled, s.next_run_at nextRunAt,
      s.last_run_at lastRunAt, s.last_status lastStatus, s.last_error lastError,
      s.created_at createdAt, s.updated_at updatedAt
    FROM backup_schedules s
    INNER JOIN backup_s3_destinations d ON d.id = s.destination_id
    ORDER BY s.name COLLATE NOCASE
  `).all() as Array<Record<string, unknown>>;
  return rows.map(publicSchedule);
}

export function getBackupSchedule(id: string): BackupSchedule | null {
  const row = sqliteDatabase.prepare(`
    SELECT s.id, s.name, s.cron_expression cronExpression, s.timezone,
      s.destination_id destinationId, d.name destinationName,
      s.destination_directory destinationDirectory, s.retention_count retentionCount,
      s.retention_days retentionDays, s.enabled, s.next_run_at nextRunAt,
      s.last_run_at lastRunAt, s.last_status lastStatus, s.last_error lastError,
      s.created_at createdAt, s.updated_at updatedAt
    FROM backup_schedules s
    INNER JOIN backup_s3_destinations d ON d.id = s.destination_id
    WHERE s.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  return row ? publicSchedule(row) : null;
}

export function insertBackupSchedule(input: z.infer<typeof scheduleInputSchema>, nextRunAt: string | null) {
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    sqliteDatabase.prepare(`
      INSERT INTO backup_schedules (
        id, name, cron_expression, timezone, destination_id, destination_directory,
        retention_count, retention_days, enabled, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.cronExpression, input.timezone, input.destinationId,
      cleanPrefix(input.destinationDirectory), input.retentionCount, input.retentionDays,
      input.enabled ? 1 : 0, input.enabled ? nextRunAt : null, now, now,
    );
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
  return getBackupSchedule(id)!;
}

export function updateBackupSchedule(id: string, input: z.infer<typeof scheduleInputSchema>, nextRunAt: string | null) {
  if (!getBackupSchedule(id)) throw createError({ statusCode: 404, statusMessage: 'backup_schedule_not_found' });
  try {
    sqliteDatabase.prepare(`
      UPDATE backup_schedules SET name = ?, cron_expression = ?, timezone = ?, destination_id = ?,
        destination_directory = ?, retention_count = ?, retention_days = ?, enabled = ?,
        next_run_at = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name, input.cronExpression, input.timezone, input.destinationId,
      cleanPrefix(input.destinationDirectory), input.retentionCount, input.retentionDays,
      input.enabled ? 1 : 0, input.enabled ? nextRunAt : null, new Date().toISOString(), id,
    );
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
  return getBackupSchedule(id)!;
}

export function deleteBackupSchedule(id: string) {
  const result = sqliteDatabase.prepare('DELETE FROM backup_schedules WHERE id = ?').run(id);
  if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'backup_schedule_not_found' });
  return { ok: true };
}

function publicDestination(row: DestinationRow): BackupDestination {
  return {
    ...row,
    endpoint: row.endpoint ?? '',
    prefix: row.prefix ?? '',
    forcePathStyle: Boolean(row.forcePathStyle),
    serverSideEncryption: row.serverSideEncryption ?? '',
    kmsKeyId: row.kmsKeyId ?? '',
    credentialsConfigured: Boolean(row.credentialsConfigured),
  };
}

function publicSchedule(row: Record<string, unknown>): BackupSchedule {
  return { ...row, enabled: Boolean(row.enabled) } as BackupSchedule;
}

function cleanPrefix(value = '') {
  return value.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function emptyToNull(value?: string) {
  return value || null;
}

function normalizeDatabaseError(error: unknown): never {
  const message = String(error);
  if (message.includes('UNIQUE constraint failed')) {
    throw createError({ statusCode: 409, statusMessage: 'backup_name_exists' });
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    throw createError({ statusCode: 400, statusMessage: 'backup_destination_not_found' });
  }
  throw error;
}

interface StoredCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

function secretDirectory() {
  const directory = path.join(appDataRoot(), 'secrets', 'backup-destinations');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(directory), 0o700);
  fs.chmodSync(directory, 0o700);
  return directory;
}

function masterKey() {
  const keyPath = path.join(appDataRoot(), 'secrets', 'backup-config.key');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(keyPath), 0o700);
  try {
    fs.writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  fs.chmodSync(keyPath, 0o600);
  const key = fs.readFileSync(keyPath);
  if (key.byteLength !== 32) throw new Error('backup_credentials_key_invalid');
  return key;
}

function credentialPath(id: string) {
  return path.join(secretDirectory(), `${id}.json`);
}

function writeCredentials(id: string, accessKeyId: string, secretAccessKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ accessKeyId, secretAccessKey }), 'utf8'), cipher.final()]);
  const payload = JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
  const target = credentialPath(id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, payload, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
}

function readCredentials(id: string): StoredCredentials {
  try {
    const stored = JSON.parse(fs.readFileSync(credentialPath(id), 'utf8')) as {
      version: number; iv: string; tag: string; ciphertext: string;
    };
    if (stored.version !== 1) throw new Error('version');
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')) as StoredCredentials;
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'backup_credentials_unavailable' });
  }
}

function deleteCredentials(id: string) {
  fs.rmSync(path.join(appDataRoot(), 'secrets', 'backup-destinations', `${id}.json`), { force: true });
}
