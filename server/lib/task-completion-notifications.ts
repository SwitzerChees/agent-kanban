import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, schema } from './db';

export interface TaskCompletionNotificationPayload {
  notificationId: number;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

export function enqueueTaskCompletionNotification(input: {
  taskId: string;
  assigneeId: string | null;
  agentRunId: string;
}) {
  if (!input.assigneeId) return null;
  const result = db.insert(schema.taskCompletionNotifications).values({
    userId: input.assigneeId,
    taskId: input.taskId,
    agentRunId: input.agentRunId,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
  }).onConflictDoNothing().run();
  return result.changes === 1 ? Number(result.lastInsertRowid) : null;
}

export function listPendingTaskCompletionNotifications(userId: string, limit = 50): TaskCompletionNotificationPayload[] {
  return db.select({
    notificationId: schema.taskCompletionNotifications.id,
    taskId: schema.tasks.id,
    taskKey: schema.tasks.key,
    taskTitle: schema.tasks.title,
    projectId: schema.projects.id,
    projectName: schema.projects.name,
    createdAt: schema.taskCompletionNotifications.createdAt,
  }).from(schema.taskCompletionNotifications)
    .innerJoin(schema.tasks, eq(schema.taskCompletionNotifications.taskId, schema.tasks.id))
    .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
    .where(and(
      eq(schema.taskCompletionNotifications.userId, userId),
      isNull(schema.taskCompletionNotifications.deliveredAt),
    ))
    .orderBy(asc(schema.taskCompletionNotifications.id))
    .limit(Math.min(Math.max(limit, 1), 100))
    .all();
}

export function claimTaskCompletionNotification(notificationId: number, userId: string) {
  const result = db.update(schema.taskCompletionNotifications).set({
    deliveredAt: new Date().toISOString(),
  }).where(and(
    eq(schema.taskCompletionNotifications.id, notificationId),
    eq(schema.taskCompletionNotifications.userId, userId),
    isNull(schema.taskCompletionNotifications.deliveredAt),
  )).run();
  return result.changes === 1;
}
