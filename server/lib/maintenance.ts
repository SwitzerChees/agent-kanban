import { createError } from 'h3';
import { count, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';

export type MaintenanceKind = 'backup' | 'import';

let activeKind: MaintenanceKind | null = null;

export function isMaintenanceMode() {
  return activeKind !== null;
}

export function maintenanceKind() {
  return activeKind;
}

export function beginMaintenance(kind: MaintenanceKind) {
  if (activeKind) {
    throw createError({ statusCode: 409, statusMessage: 'maintenance_busy' });
  }
  activeKind = kind;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeKind === kind) activeKind = null;
  };
}

export function assertRuntimeIdle() {
  const blockers = {
    taskRuns: db.select({ value: count() }).from(schema.tasks)
      .where(inArray(schema.tasks.agentStatus, ['running', 'waiting_external'])).get()?.value ?? 0,
    refinements: db.select({ value: count() }).from(schema.taskRefinements)
      .where(inArray(schema.taskRefinements.status, ['running', 'awaiting_input'])).get()?.value ?? 0,
    chats: db.select({ value: count() }).from(schema.projectChatThreads)
      .where(eq(schema.projectChatThreads.status, 'running')).get()?.value ?? 0,
    e2eRuns: db.select({ value: count() }).from(schema.e2eTestRuns)
      .where(eq(schema.e2eTestRuns.status, 'running')).get()?.value ?? 0,
    voiceJobs: db.select({ value: count() }).from(schema.projectChatVoiceJobs)
      .where(eq(schema.projectChatVoiceJobs.status, 'running')).get()?.value ?? 0,
  };
  const total = Object.values(blockers).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'backup_runtime_busy',
      data: { blockers },
    });
  }
}
