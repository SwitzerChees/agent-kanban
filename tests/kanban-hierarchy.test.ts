import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-hierarchy-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'hierarchy-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'hierarchy-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let localDispatcher: typeof import('../server/lib/local-dispatcher');
let passwordSecurity: typeof import('../server/lib/security/password');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  localDispatcher = await import('../server/lib/local-dispatcher');
  passwordSecurity = await import('../server/lib/security/password');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('project topic hierarchy', () => {
  test('creates a default hierarchy and keeps tasks inside their selected sub-topic', async () => {
    const project = await kanban.createProject({
      name: 'Hierarchy Project',
      key: 'HIER',
      folderPath: path.join(testRoot, 'workspace-hierarchy'),
    }, admin);

    const initialBoard = kanban.getBoard(project.id, admin);
    expect(initialBoard.oberthemen).toHaveLength(1);
    expect(initialBoard.unterthemen).toHaveLength(1);
    expect(initialBoard.unterthemen[0]?.oberthemaId).toBe(initialBoard.oberthemen[0]?.id);

    const parent = kanban.createOberthema(project.id, {
      name: 'Delivery',
      description: 'Features prepared for delivery',
      color: 'indigo',
    }, admin);
    const subtopic = kanban.createUnterthema(parent.id, {
      name: 'Frontend',
      description: 'User-facing work',
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Build hierarchy navigation',
      unterthemaId: subtopic.id,
    }, admin);

    expect(task?.unterthemaId).toBe(subtopic.id);
    expect(task?.agentEnabled).toBe(false);
    const detail = kanban.getTaskDetail(task!.id, admin);
    expect(detail.hierarchy?.oberthema.id).toBe(parent.id);
    expect(detail.hierarchy?.unterthema?.id).toBe(subtopic.id);

    const directTask = await kanban.createTask(project.id, {
      title: 'Plan delivery directly in the parent topic',
      oberthemaId: parent.id,
    }, admin);
    expect(directTask).toMatchObject({ oberthemaId: parent.id, unterthemaId: null, agentEnabled: false });
    expect(kanban.getTaskDetail(directTask!.id, admin).hierarchy).toMatchObject({
      oberthema: { id: parent.id },
      unterthema: null,
    });

    dbModule.ensureTaskHierarchy();
    expect(dbModule.db.select().from(dbModule.schema.tasks)
      .where(eq(dbModule.schema.tasks.id, directTask!.id)).get()).toMatchObject({
      oberthemaId: parent.id,
      unterthemaId: null,
    });

    const fallback = initialBoard.unterthemen[0]!;
    expect(() => dbModule.db.update(dbModule.schema.tasks).set({
      oberthemaId: parent.id,
      unterthemaId: fallback.id,
    }).where(eq(dbModule.schema.tasks.id, directTask!.id)).run()).toThrow(/invalid_task_hierarchy/);

    const todoColumn = initialBoard.columns.find((column) => column.key === 'todo')!;
    expect((await kanban.updateTask(directTask!.id, { columnId: todoColumn.id }, admin))?.agentStatus).toBe('idle');
    await expect(kanban.updateTask(directTask!.id, { agentEnabled: true }, admin)).resolves.toMatchObject({ agentEnabled: true, agentStatus: 'queued' });
    await expect(kanban.updateTask(directTask!.id, { agentEnabled: false }, admin)).resolves.toMatchObject({ agentEnabled: false, agentStatus: 'idle' });

    expectStatusMessage(
      () => kanban.createOberthema(project.id, { name: 'delivery' }, admin),
      'oberthema_name_exists',
    );
    expectStatusMessage(
      () => kanban.deleteUnterthema(subtopic.id, admin),
      'unterthema_not_empty',
    );

    await kanban.updateTask(task!.id, { unterthemaId: fallback.id }, admin);
    expect(kanban.deleteUnterthema(subtopic.id, admin)).toMatchObject({ ok: true });
  });

  test('keeps raw Codex protocol events out of task details and recovers failed task placement', async () => {
    const project = await kanban.createProject({
      name: 'Compact Activity Project',
      key: 'COMPACT',
      folderPath: path.join(testRoot, 'workspace-compact-activity'),
    }, admin);
    const board = kanban.getBoard(project.id, admin);
    const inProgress = board.columns.find((column) => column.key === 'in_progress')!;
    const inReview = board.columns.find((column) => column.key === 'in_review')!;
    const task = await kanban.createTask(project.id, {
      title: 'Do not load protocol noise',
      agentEnabled: true,
    }, admin);

    kanban.logTaskActivity(project.id, task!.id, null, 'codex_event', {
      raw: 'x'.repeat(100_000),
    });
    kanban.logTaskActivity(project.id, task!.id, null, 'codex_text_update', {
      body: 'A useful progress update',
    });

    const detail = kanban.getTaskDetail(task!.id, admin);
    expect(detail.events.map((event) => event.action)).toContain('codex_text_update');
    expect(detail.events.map((event) => event.action)).not.toContain('codex_event');
    expect(JSON.stringify(detail).length).toBeLessThan(20_000);

    dbModule.db.update(dbModule.schema.tasks).set({
      agentStatus: 'failed',
      columnId: inProgress.id,
    }).where(eq(dbModule.schema.tasks.id, task!.id)).run();

    expect(localDispatcher.reconcileFailedTaskColumns()).toBeGreaterThanOrEqual(1);
    expect(dbModule.db.select().from(dbModule.schema.tasks)
      .where(eq(dbModule.schema.tasks.id, task!.id)).get()).toMatchObject({
      agentStatus: 'failed',
      columnId: inReview.id,
    });
  });

  test('rejects hierarchy moves and task assignments across projects', async () => {
    const firstProject = await kanban.createProject({
      name: 'First Project',
      key: 'FIRST',
      folderPath: path.join(testRoot, 'workspace-first'),
    }, admin);
    const secondProject = await kanban.createProject({
      name: 'Second Project',
      key: 'SECOND',
      folderPath: path.join(testRoot, 'workspace-second'),
    }, admin);
    const firstBoard = kanban.getBoard(firstProject.id, admin);
    const secondBoard = kanban.getBoard(secondProject.id, admin);
    const firstSubtopic = firstBoard.unterthemen[0]!;
    const secondParent = secondBoard.oberthemen[0]!;
    const secondSubtopic = secondBoard.unterthemen[0]!;

    expectStatusMessage(
      () => kanban.updateUnterthema(firstSubtopic.id, { oberthemaId: secondParent.id }, admin),
      'invalid_oberthema',
    );

    await expect(kanban.createTask(firstProject.id, {
      title: 'Invalid cross-project task',
      unterthemaId: secondSubtopic.id,
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_unterthema' });
  });

  test('defaults responsibility to the creator while allowing project members or nobody', async () => {
    const project = await kanban.createProject({
      name: 'Responsibility Project',
      key: 'RESP',
      folderPath: path.join(testRoot, 'workspace-responsibility'),
    }, admin);
    const member = insertUser('responsibility-member', 'Member');
    const outsider = insertUser('responsibility-outsider', 'Outsider');
    kanban.addProjectUser(project.id, member.id, admin);

    const defaultTask = await kanban.createTask(project.id, { title: 'Owned by creator' }, admin);
    expect(defaultTask?.assigneeId).toBe(admin.id);

    const unassignedTask = await kanban.createTask(project.id, {
      title: 'Explicitly unassigned',
      assigneeId: null,
    }, admin);
    expect(unassignedTask?.assigneeId).toBeNull();

    const aiTask = await kanban.createTask(project.id, {
      title: 'AI task with human responsibility',
      assigneeId: member.id,
      agentEnabled: true,
    }, admin);
    expect(aiTask).toMatchObject({ assigneeId: member.id, agentEnabled: true });
    await expect(kanban.updateTask(aiTask!.id, { assigneeId: null }, admin)).resolves.toMatchObject({
      assigneeId: null,
      agentEnabled: true,
    });
    expect((await kanban.updateTask(aiTask!.id, { assigneeId: member.id }, admin))?.assigneeId).toBe(member.id);

    const [idempotentTask, idempotentRetry] = await Promise.all([
      kanban.createTask(project.id, {
        title: 'Create once',
        clientRequestId: '51b5cc91-d9e5-4e40-b9ab-d336a817bb36',
        files: [{
          fileName: 'context.txt',
          mimeType: 'text/plain',
          data: Buffer.from('refinement context'),
        }],
      }, admin),
      kanban.createTask(project.id, {
        title: 'Do not create this duplicate',
        clientRequestId: '51b5cc91-d9e5-4e40-b9ab-d336a817bb36',
      }, admin),
    ]);
    expect(idempotentRetry?.id).toBe(idempotentTask?.id);
    expect(idempotentRetry?.title).toBe('Create once');
    expect(kanban.getTaskDetail(idempotentTask!.id, admin).task.attachments).toHaveLength(1);

    const completedRetry = await kanban.createTask(project.id, {
      title: 'Still do not create a duplicate',
      clientRequestId: '51b5cc91-d9e5-4e40-b9ab-d336a817bb36',
    }, admin);
    expect(completedRetry?.id).toBe(idempotentTask?.id);

    const storedIdempotentAttachment = dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.taskId, idempotentTask!.id)).get()!;
    dbModule.db.delete(dbModule.schema.activity)
      .where(eq(dbModule.schema.activity.taskId, idempotentTask!.id)).run();
    dbModule.db.update(dbModule.schema.tasks)
      .set({ createdAt: '2000-01-01T00:00:00.000Z' })
      .where(eq(dbModule.schema.tasks.id, idempotentTask!.id)).run();

    const recoveredTask = await kanban.createTask(project.id, {
      title: 'Recover stale creation',
      clientRequestId: '51b5cc91-d9e5-4e40-b9ab-d336a817bb36',
    }, admin);
    expect(recoveredTask?.id).not.toBe(idempotentTask?.id);
    expect(recoveredTask?.title).toBe('Recover stale creation');
    expect(existsSync(storedIdempotentAttachment.storagePath)).toBe(false);

    await kanban.updateProject(project.id, { userIds: [] }, admin);
    expect(kanban.getBoard(project.id, admin).tasks.find((task) => task.id === aiTask?.id)?.assigneeId).toBeNull();

    await expect(kanban.createTask(project.id, {
      title: 'Invalid responsibility',
      assigneeId: outsider.id,
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_assignee' });
  });

  test('keeps comment mentions unread per user until each mentioned comment is viewed', async () => {
    const project = await kanban.createProject({
      name: 'Mention Project',
      key: 'MENTION',
      folderPath: path.join(testRoot, 'workspace-mentions'),
    }, admin);
    const mentionedMember = insertUser('mentioned-member', 'Mentioned Member');
    const outsider = insertUser('mention-outsider', 'Mention Outsider');
    kanban.addProjectUser(project.id, mentionedMember.id, admin);
    const task = await kanban.createTask(project.id, { title: 'Review the mentions' }, admin);

    const firstComment = kanban.addTaskComment(
      task!.id,
      'Please review this, @Mentioned Member.',
      [mentionedMember.id],
      admin,
    );
    const secondComment = kanban.addTaskComment(
      task!.id,
      'And this follow-up, @Mentioned Member.',
      [mentionedMember.id],
      admin,
    );

    expect(firstComment.mentions).toEqual([{
      userId: mentionedMember.id,
      userName: mentionedMember.name,
    }]);
    expect(kanban.getBoard(project.id, mentionedMember).tasks.find((item) => item.id === task!.id))
      .toMatchObject({ unreadMentionCount: 2 });
    expect(kanban.getBoard(project.id, admin).tasks.find((item) => item.id === task!.id))
      .toMatchObject({ unreadMentionCount: 0 });

    const unreadDetail = kanban.getTaskDetail(task!.id, mentionedMember);
    expect(unreadDetail.unreadMentionCount).toBe(2);
    expect(unreadDetail.comments.filter((comment) => comment.unreadMention)).toHaveLength(2);

    expect(kanban.markTaskMentionsSeen(task!.id, [firstComment.id], mentionedMember))
      .toMatchObject({ ok: true, count: 1 });
    expect(kanban.getBoard(project.id, mentionedMember).tasks.find((item) => item.id === task!.id))
      .toMatchObject({ unreadMentionCount: 1 });
    expect(kanban.markTaskMentionsSeen(task!.id, [secondComment.id], mentionedMember))
      .toMatchObject({ ok: true, count: 1 });
    expect(kanban.getTaskDetail(task!.id, mentionedMember)).toMatchObject({ unreadMentionCount: 0 });

    expectStatusMessage(
      () => kanban.addTaskComment(task!.id, '@Mention Outsider', [outsider.id], admin),
      'invalid_comment_mention',
    );
  });

  test('reorders parent and sub-topics atomically, including moves between parents', async () => {
    const project = await kanban.createProject({
      name: 'Reorder Project',
      key: 'ORDER',
      folderPath: path.join(testRoot, 'workspace-order'),
    }, admin);
    const initial = kanban.getBoard(project.id, admin);
    const firstParent = initial.oberthemen[0]!;
    const firstSubtopic = initial.unterthemen[0]!;
    const secondParent = kanban.createOberthema(project.id, { name: 'Second parent' }, admin);
    const secondSubtopic = kanban.createUnterthema(secondParent.id, { name: 'Second sub-topic' }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Move with its sub-topic',
      unterthemaId: firstSubtopic.id,
    }, admin);

    const reordered = kanban.reorderHierarchy(project.id, {
      oberthemaIds: [secondParent.id, firstParent.id],
      unterthemen: [
        { oberthemaId: secondParent.id, ids: [secondSubtopic.id, firstSubtopic.id] },
        { oberthemaId: firstParent.id, ids: [] },
      ],
    }, admin);

    expect(reordered.oberthemen.map((topic) => topic.id)).toEqual([secondParent.id, firstParent.id]);
    expect(reordered.unterthemen.map((topic) => topic.id)).toEqual([secondSubtopic.id, firstSubtopic.id]);
    expect(reordered.tasks.find((item) => item.id === task?.id)).toMatchObject({
      oberthemaId: secondParent.id,
      unterthemaId: firstSubtopic.id,
    });

    expectStatusMessage(
      () => kanban.reorderHierarchy(project.id, {
        oberthemaIds: [secondParent.id, secondParent.id],
        unterthemen: [
          { oberthemaId: secondParent.id, ids: [secondSubtopic.id, firstSubtopic.id] },
          { oberthemaId: firstParent.id, ids: [] },
        ],
      }, admin),
      'invalid_hierarchy_order',
    );
  });

  test('keeps uploaded files visible and removes their database record and stored file on deletion', async () => {
    const project = await kanban.createProject({
      name: 'Attachment Project',
      key: 'FILES',
      folderPath: path.join(testRoot, 'workspace-attachments'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Task with a persisted file',
      files: [{
        fileName: 'briefing.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Persist me'),
      }],
    }, admin);
    const attachment = kanban.getTaskDetail(task!.id, admin).task.attachments[0]!;
    const stored = dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.id, attachment.id))
      .get()!;

    expect(attachment).toMatchObject({ fileName: 'briefing.txt', extension: '.txt', mimeType: 'text/plain', size: 10 });
    expect(attachment).not.toHaveProperty('storagePath');
    expect(existsSync(stored.storagePath)).toBe(true);

    const renamed = kanban.renameTaskAttachment(task!.id, attachment.id, 'final-briefing.txt', admin);
    expect(renamed.task.attachments[0]).toMatchObject({
      id: attachment.id,
      fileName: 'final-briefing.txt',
    });
    expect(dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.id, attachment.id)).get()).toMatchObject({
      fileName: 'final-briefing.txt',
      storagePath: stored.storagePath,
    });
    expect(() => kanban.renameTaskAttachment(task!.id, attachment.id, '../unsafe.txt', admin))
      .toThrowError(expect.objectContaining({ statusMessage: 'invalid_attachment_file_name' }));
    expect(() => kanban.renameTaskAttachment(task!.id, attachment.id, 'final-briefing.md', admin))
      .toThrowError(expect.objectContaining({ statusMessage: 'attachment_file_extension_locked' }));

    const detail = await kanban.deleteTaskAttachment(task!.id, attachment.id, admin);

    expect(detail.task.attachments).toEqual([]);
    expect(dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.id, attachment.id)).get()).toBeUndefined();
    expect(existsSync(stored.storagePath)).toBe(false);
  });

  test('removes persisted attachment files when deleting their task', async () => {
    const project = await kanban.createProject({
      name: 'Deleted Attachment Project',
      key: 'DELFILES',
      folderPath: path.join(testRoot, 'workspace-deleted-attachments'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Delete task and its file',
      files: [{
        fileName: 'temporary.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Remove me'),
      }],
    }, admin);
    const attachment = dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.taskId, task!.id))
      .get()!;

    expect(existsSync(attachment.storagePath)).toBe(true);
    await expect(kanban.deleteTask(task!.id, admin)).resolves.toEqual({ ok: true });
    expect(existsSync(attachment.storagePath)).toBe(false);
    expect(dbModule.db.select().from(dbModule.schema.attachments)
      .where(eq(dbModule.schema.attachments.id, attachment.id)).get()).toBeUndefined();
    expect(dbModule.db.select().from(dbModule.schema.tasks)
      .where(eq(dbModule.schema.tasks.id, task!.id)).get()).toBeUndefined();
  });

  test('builds a permission-filtered command palette index without attachment payloads', async () => {
    const firstProject = await kanban.createProject({
      name: 'Palette Visible Project',
      key: 'PALVIS',
      folderPath: path.join(testRoot, 'workspace-palette-visible'),
      tags: ['customer', 'launch'],
    }, admin);
    const secondProject = await kanban.createProject({
      name: 'Palette Hidden Project',
      key: 'PALHID',
      folderPath: path.join(testRoot, 'workspace-palette-hidden'),
    }, admin);
    const member = insertUser('palette-index-member', 'Palette Member');
    kanban.addProjectUser(firstProject.id, member.id, admin);

    const visibleParent = kanban.createOberthema(firstProject.id, {
      name: 'Visible parent topic',
      description: 'Visible parent description',
    }, admin);
    const visibleSubtopic = kanban.createUnterthema(visibleParent.id, {
      name: 'Visible sub-topic',
      description: 'Visible sub-topic description',
    }, admin);
    const visibleTodo = kanban.getBoard(firstProject.id, admin).columns.find((column) => column.key === 'todo')!;
    const createdVisibleTask = await kanban.createTask(firstProject.id, {
      title: 'Searchable visible task',
      description: 'A description included in the search index',
      unterthemaId: visibleSubtopic.id,
      assigneeId: member.id,
      agentEnabled: true,
      priority: 'high',
      tags: ['customer', 'launch'],
      files: [{
        fileName: 'not-indexed.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Attachment content must not be indexed'),
      }],
    }, admin);
    const visibleTask = (await kanban.updateTask(createdVisibleTask!.id, { columnId: visibleTodo.id }, admin))!;

    const hiddenBoard = kanban.getBoard(secondProject.id, admin);
    const hiddenTask = await kanban.createTask(secondProject.id, {
      title: 'Task hidden from the member',
      unterthemaId: hiddenBoard.unterthemen[0]!.id,
      assigneeId: null,
    }, admin);

    const memberIndex = kanban.getCommandPaletteIndex(member);
    expect(memberIndex.tasks.map((task) => task.id)).toContain(visibleTask!.id);
    expect(memberIndex.tasks.map((task) => task.id)).not.toContain(hiddenTask!.id);
    expect(memberIndex.tasks.every((task) => task.projectId === firstProject.id)).toBe(true);
    expect(memberIndex.topics.every((topic) => topic.projectId === firstProject.id)).toBe(true);

    const indexedTask = memberIndex.tasks.find((task) => task.id === visibleTask!.id)!;
    expect(indexedTask).toMatchObject({
      projectId: firstProject.id,
      projectKey: firstProject.key,
      projectName: firstProject.name,
      key: visibleTask!.key,
      title: 'Searchable visible task',
      description: 'A description included in the search index',
      priority: 'high',
      columnId: visibleTodo.id,
      columnKey: 'todo',
      columnNameEn: 'To Do',
      columnNameDe: 'Zu erledigen',
      columnDone: false,
      oberthemaId: visibleParent.id,
      oberthemaName: 'Visible parent topic',
      unterthemaId: visibleSubtopic.id,
      unterthemaName: 'Visible sub-topic',
      assigneeId: member.id,
      assigneeName: member.name,
      assigneeEmail: member.email,
      agentEnabled: true,
      agentStatus: 'queued',
      tags: ['customer', 'launch'],
      updatedAt: visibleTask!.updatedAt,
    });
    expect(indexedTask).not.toHaveProperty('attachments');

    expect(memberIndex.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: visibleParent.id,
        kind: 'oberthema',
        projectId: firstProject.id,
        name: 'Visible parent topic',
      }),
      expect.objectContaining({
        id: visibleSubtopic.id,
        kind: 'unterthema',
        projectId: firstProject.id,
        oberthemaId: visibleParent.id,
        oberthemaName: visibleParent.name,
        name: 'Visible sub-topic',
      }),
    ]));

    const adminIndex = kanban.getCommandPaletteIndex(admin);
    expect(adminIndex.tasks.map((task) => task.id)).toEqual(expect.arrayContaining([visibleTask!.id, hiddenTask!.id]));
    expect(adminIndex.topics.some((topic) => topic.projectId === secondProject.id)).toBe(true);
  });
});

describe('admin user management', () => {
  test('updates identity, password and role while protecting the current admin', () => {
    const editableUser = insertUser('editable-user', 'Editable User');
    const otherUser = insertUser('other-user', 'Other User');

    const updatedUsers = kanban.updateUser(editableUser.id, {
      name: 'Updated Person',
      email: 'Updated.Person@Example.com',
      password: 'new-secure-password',
      role: 'admin',
    }, admin);
    const updated = dbModule.db.select().from(dbModule.schema.users)
      .where(eq(dbModule.schema.users.id, editableUser.id))
      .get();

    expect(updated).toMatchObject({
      name: 'Updated Person',
      email: 'updated.person@example.com',
      role: 'admin',
    });
    expect(passwordSecurity.verifyPassword('new-secure-password', updated!.passwordHash)).toBe(true);
    expect(updatedUsers.find((row) => row.id === editableUser.id)).toMatchObject({
      name: 'Updated Person',
      role: 'admin',
    });

    expectStatusMessage(
      () => kanban.updateUser(admin.id, { role: 'member' }, admin),
      'self_admin_role_required',
    );
    expectStatusMessage(
      () => kanban.updateUser(editableUser.id, { email: otherUser.email }, admin),
      'user_email_exists',
    );
    expectStatusMessage(
      () => kanban.updateUser(editableUser.id, { name: 'Blocked' }, otherUser),
      'admin_required',
    );
  });

  test('deactivates deleted users, removes access and preserves admin self-protection', async () => {
    const deletableUser = insertUser('deletable-user', 'Deletable User');
    const project = await kanban.createProject({
      name: 'User deletion project',
      key: 'USRDEL',
      folderPath: path.join(testRoot, 'workspace-user-deletion'),
      userIds: [deletableUser.id],
    }, admin);
    const board = kanban.getBoard(project.id, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Assigned before deletion',
      assigneeId: deletableUser.id,
    }, admin);
    dbModule.db.insert(dbModule.schema.sessions).values({
      id: 'deletable-user-session',
      userId: deletableUser.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    }).run();

    const remainingUsers = kanban.deleteUser(deletableUser.id, admin);
    const deleted = dbModule.db.select().from(dbModule.schema.users)
      .where(eq(dbModule.schema.users.id, deletableUser.id))
      .get();
    const updatedTask = dbModule.db.select().from(dbModule.schema.tasks)
      .where(eq(dbModule.schema.tasks.id, task!.id))
      .get();

    expect(board.members.some((member) => member.id === deletableUser.id)).toBe(true);
    expect(deleted?.active).toBe(false);
    expect(updatedTask?.assigneeId).toBeNull();
    expect(dbModule.db.select().from(dbModule.schema.projectUsers)
      .where(eq(dbModule.schema.projectUsers.userId, deletableUser.id))
      .all()).toHaveLength(0);
    expect(dbModule.db.select().from(dbModule.schema.sessions)
      .where(eq(dbModule.schema.sessions.userId, deletableUser.id))
      .all()).toHaveLength(0);
    expect(remainingUsers.some((row) => row.id === deletableUser.id)).toBe(false);

    expectStatusMessage(
      () => kanban.deleteUser(admin.id, admin),
      'self_user_delete_forbidden',
    );
    expectStatusMessage(
      () => kanban.deleteUser(admin.id, insertUser('delete-member-actor', 'Delete Member Actor')),
      'admin_required',
    );
  });
});

function expectStatusMessage(action: () => unknown, expected: string) {
  try {
    action();
    throw new Error(`Expected ${expected}`);
  } catch (error) {
    expect(error).toMatchObject({ statusMessage: expected });
  }
}

function insertUser(id: string, name: string): User {
  const now = new Date().toISOString();
  const user: User = {
    id,
    email: `${id}@example.com`,
    name,
    passwordHash: 'test-password-hash',
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(user).run();
  return user;
}
