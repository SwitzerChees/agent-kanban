import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-completion-notifications-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'completion-notification-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'completion-notification-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let notifications: typeof import('../server/lib/task-completion-notifications');
let admin: User;
let otherUser: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  notifications = await import('../server/lib/task-completion-notifications');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;

  const now = new Date().toISOString();
  otherUser = {
    ...admin,
    id: 'completion-notification-other-user',
    email: 'completion-notification-other@example.com',
    name: 'Other user',
    role: 'member',
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(otherUser).run();
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('task completion notifications', () => {
  test('queues one durable notification for the assignee and lets only that user claim it once', async () => {
    const project = await kanban.createProject({
      name: 'Completion Notifications',
      key: 'NOTIFY',
      folderPath: path.join(testRoot, 'workspace'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Prepare the release notes',
      assigneeId: admin.id,
    }, admin);

    const notificationId = notifications.enqueueTaskCompletionNotification({
      taskId: task!.id,
      assigneeId: task!.assigneeId,
      agentRunId: 'notification-run-1',
    });
    expect(notificationId).toEqual(expect.any(Number));
    expect(notifications.enqueueTaskCompletionNotification({
      taskId: task!.id,
      assigneeId: task!.assigneeId,
      agentRunId: 'notification-run-1',
    })).toBeNull();
    expect(notifications.enqueueTaskCompletionNotification({
      taskId: task!.id,
      assigneeId: null,
      agentRunId: 'notification-run-unassigned',
    })).toBeNull();

    expect(notifications.listPendingTaskCompletionNotifications(otherUser.id)).toEqual([]);
    expect(notifications.listPendingTaskCompletionNotifications(admin.id)).toEqual([
      expect.objectContaining({
        notificationId,
        taskId: task!.id,
        taskKey: task!.key,
        taskTitle: task!.title,
        projectId: project.id,
        projectName: project.name,
      }),
    ]);

    expect(notifications.claimTaskCompletionNotification(notificationId!, otherUser.id)).toBe(false);
    expect(notifications.claimTaskCompletionNotification(notificationId!, admin.id)).toBe(true);
    expect(notifications.claimTaskCompletionNotification(notificationId!, admin.id)).toBe(false);
    expect(notifications.listPendingTaskCompletionNotifications(admin.id)).toEqual([]);
  });
});
