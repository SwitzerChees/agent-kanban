import { Cron } from 'croner';
import { createError } from 'h3';
import { sqliteDatabase } from '../db';
import { runtimeLogger } from '../logger';
import { assertRuntimeIdle, beginMaintenance, isMaintenanceMode } from '../maintenance';
import { createBackupArchive } from './export';
import { backupDestinationConfig, getBackupSchedule, type BackupSchedule } from './settings';
import { prefixWithDirectory, uploadBackupToS3 } from './s3';

let scheduler: BackupScheduler | null = null;

export function startBackupScheduler() {
  if (!scheduler) scheduler = new BackupScheduler();
  scheduler.start();
  return scheduler;
}

export function nextBackupRun(cronExpression: string, timezone: string, after = new Date()) {
  validateTimezone(timezone);
  try {
    const cron = new Cron(cronExpression, { timezone, paused: true, mode: '5-part' });
    const next = cron.nextRun(after);
    cron.stop();
    if (!next) throw new Error('no_next_run');
    return next.toISOString();
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'backup_cron_invalid' });
  }
}

export function queueBackupScheduleNow(id: string) {
  const schedule = getBackupSchedule(id);
  if (!schedule) throw createError({ statusCode: 404, statusMessage: 'backup_schedule_not_found' });
  if (!schedule.enabled) {
    throw createError({ statusCode: 409, statusMessage: 'backup_schedule_disabled' });
  }
  if (schedule.lastStatus === 'running') {
    throw createError({ statusCode: 409, statusMessage: 'backup_schedule_running' });
  }
  sqliteDatabase.prepare(`
    UPDATE backup_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), id);
  void scheduler?.tick();
  return { ok: true, queued: true };
}

export async function executeBackupSchedule(schedule: BackupSchedule) {
  const config = backupDestinationConfig(schedule.destinationId);
  config.prefix = prefixWithDirectory(config.prefix, schedule.destinationDirectory);
  config.retentionCount = schedule.retentionCount;
  config.retentionDays = schedule.retentionDays;
  const releaseMaintenance = beginMaintenance('backup');
  try {
    assertRuntimeIdle();
    const backup = await createBackupArchive();
    try {
      return await uploadBackupToS3(backup.path, backup.fileName, config);
    } finally {
      await backup.cleanup();
    }
  } finally {
    releaseMaintenance();
  }
}

class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private promise: Promise<void> | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.recoverInterruptedRuns();
    this.recalculateMissingRuns();
    const pollMs = Math.max(1_000, Number.parseInt(process.env.KANBAN_BACKUP_POLL_MS ?? '15000', 10));
    this.timer = setInterval(() => { void this.tick(); }, pollMs);
    this.timer.unref();
    void this.tick();
  }

  async stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.promise;
  }

  async tick() {
    if (!this.started || this.promise || isMaintenanceMode()) return;
    const schedule = this.claimDueSchedule();
    if (!schedule) return;
    this.promise = this.run(schedule);
    try {
      await this.promise;
    } finally {
      this.promise = null;
      if (this.started) queueMicrotask(() => { void this.tick(); });
    }
  }

  private claimDueSchedule() {
    const now = new Date();
    const row = sqliteDatabase.prepare(`
      SELECT id FROM backup_schedules
      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
        AND COALESCE(last_status, '') <> 'running'
      ORDER BY next_run_at, created_at LIMIT 1
    `).get(now.toISOString()) as { id: string } | undefined;
    if (!row) return null;
    const schedule = getBackupSchedule(row.id);
    if (!schedule) return null;
    const nextRunAt = nextBackupRun(schedule.cronExpression, schedule.timezone, now);
    const claimed = sqliteDatabase.prepare(`
      UPDATE backup_schedules SET last_status = 'running', last_error = NULL,
        last_run_at = ?, next_run_at = ?, updated_at = ?
      WHERE id = ? AND enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
        AND COALESCE(last_status, '') <> 'running'
    `).run(now.toISOString(), nextRunAt, now.toISOString(), schedule.id, now.toISOString());
    return claimed.changes ? { ...schedule, lastStatus: 'running' as const, lastRunAt: now.toISOString(), nextRunAt } : null;
  }

  private async run(schedule: BackupSchedule) {
    try {
      const result = await executeBackupSchedule(schedule);
      sqliteDatabase.prepare(`
        UPDATE backup_schedules SET last_status = 'success', last_error = NULL, updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), schedule.id);
      runtimeLogger.info('scheduled backup completed', {
        schedule_id: schedule.id,
        destination_id: schedule.destinationId,
        deleted_backups: result.deletedBackups,
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      sqliteDatabase.prepare(`
        UPDATE backup_schedules SET last_status = 'failed', last_error = ?, updated_at = ? WHERE id = ?
      `).run(message, new Date().toISOString(), schedule.id);
      runtimeLogger.error('scheduled backup failed', { schedule_id: schedule.id, error: message });
    }
  }

  private recoverInterruptedRuns() {
    const now = new Date().toISOString();
    sqliteDatabase.prepare(`
      UPDATE backup_schedules SET last_status = 'failed', last_error = 'backup_interrupted', updated_at = ?
      WHERE last_status = 'running'
    `).run(now);
  }

  private recalculateMissingRuns() {
    const schedules = sqliteDatabase.prepare(`
      SELECT id, cron_expression cronExpression, timezone FROM backup_schedules
      WHERE enabled = 1 AND next_run_at IS NULL
    `).all() as Array<{ id: string; cronExpression: string; timezone: string }>;
    for (const schedule of schedules) {
      try {
        sqliteDatabase.prepare('UPDATE backup_schedules SET next_run_at = ? WHERE id = ?')
          .run(nextBackupRun(schedule.cronExpression, schedule.timezone), schedule.id);
      } catch {
        sqliteDatabase.prepare(`
          UPDATE backup_schedules SET enabled = 0, last_status = 'failed', last_error = 'backup_cron_invalid'
          WHERE id = ?
        `).run(schedule.id);
      }
    }
  }
}

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'backup_timezone_invalid' });
  }
}

function safeErrorMessage(error: unknown) {
  const candidate = (error as { statusMessage?: string })?.statusMessage
    ?? (error as { name?: string })?.name
    ?? 'backup_failed';
  return String(candidate).slice(0, 500);
}
