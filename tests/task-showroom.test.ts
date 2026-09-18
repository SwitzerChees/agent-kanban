import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User } from '../server/lib/db/schema';

const root = mkdtempSync(path.join(tmpdir(), 'agent-kanban-task-showroom-'));
process.env.KANBAN_DATA_DIR = path.join(root, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'task-showroom-tests@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'task-showroom-test-password';

let storage: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let showroom: typeof import('../server/lib/showroom');
let taskShowroom: typeof import('../server/lib/task-showroom');
let admin: User;
let outsider: User;
let projectId: string;
let taskId: string;
let taskKey: string;
const projectFolder = path.join(root, 'project');

function insertUser(name: string) {
  const stamp = new Date().toISOString();
  const row = {
    id: randomUUID(), email: `${name}@example.com`, name, passwordHash: 'unused',
    role: 'member' as const, active: true, createdAt: stamp, updatedAt: stamp,
  };
  storage.db.insert(storage.schema.users).values(row).run();
  return row;
}

beforeAll(async () => {
  storage = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  showroom = await import('../server/lib/showroom');
  taskShowroom = await import('../server/lib/task-showroom');
  admin = storage.db.select().from(storage.schema.users).get()!;
  outsider = insertUser('outsider');
  const project = await kanban.createProject({ name: 'Task Showroom', key: 'TSR', folderPath: projectFolder }, admin);
  projectId = project.id;
  const task = await kanban.createTask(project.id, { title: 'Team invitations', description: 'Design the invitation flow.' }, admin);
  taskId = task.id;
  taskKey = task.key;
  mkdirSync(path.join(projectFolder, 'showroom/Flow'), { recursive: true });
  mkdirSync(path.join(projectFolder, 'showroom/Empty'), { recursive: true });
  writeFileSync(path.join(projectFolder, 'showroom/Flow/invite.html'), '<!doctype html><title>Invite</title><button>Send</button>');
  writeFileSync(path.join(projectFolder, 'showroom/Flow/members.html'), '<!doctype html><title>Members</title>');
});

afterAll(() => {
  storage?.sqliteDatabase.close();
  rmSync(root, { recursive: true, force: true });
});

describe('task Showroom integration', () => {
  test('links folders and views and stores immutable reference versions', async () => {
    await taskShowroom.addTaskShowroomLink(taskId, taskShowroom.taskShowroomLinkInput.parse({
      kind: 'category', targetPath: 'Flow', mode: 'follow',
    }), admin);
    await taskShowroom.addTaskShowroomLink(taskId, taskShowroom.taskShowroomLinkInput.parse({
      kind: 'category', targetPath: 'Empty', mode: 'follow',
    }), admin);
    const linked = await taskShowroom.getTaskShowroom(taskId, admin);
    expect(linked.linkedViews.map(view => view.path)).toEqual(['Flow/invite.html', 'Flow/members.html']);
    expect(linked.links.some(link => link.kind === 'category' && link.targetPath === 'Empty')).toBe(true);

    const created = await taskShowroom.createTaskShowroomSpec(taskId, taskShowroom.taskShowroomSpecInput.parse({
      paths: ['Flow/invite.html'], notes: 'Approved invite direction',
    }), admin);
    expect(created.spec).toMatchObject({ version: 1, notes: 'Approved invite direction', active: true });
    expect(created.spec.entries).toHaveLength(1);

    writeFileSync(path.join(projectFolder, 'showroom/Flow/invite.html'), '<!doctype html><title>Invite changed</title>');
    const current = await taskShowroom.getTaskShowroom(taskId, admin);
    expect(current.specs[0]?.entries[0]?.hash).toBe(created.spec.entries[0]?.hash);
    await expect(taskShowroom.getTaskShowroom(taskId, outsider)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('keeps Showroom feedback on the task and starts one task-owned AI run', async () => {
    const library = await showroom.showroomLibrary(projectId, admin);
    const feedback = showroom.feedbackInput.parse({
      previewToken: library.previewToken,
      viewPath: 'Flow/invite.html',
      authorName: 'Team',
      body: 'Make the pending state clearer.',
      requestId: randomUUID(),
      taskId,
    });
    showroom.addShowroomFeedback(projectId, feedback, admin);
    expect((await taskShowroom.getTaskShowroom(taskId, admin)).feedback[0]).toMatchObject({ taskId, body: feedback.body });

    const started = taskShowroom.startTaskShowroomRun(taskId, taskShowroom.taskShowroomRunInput.parse({
      brief: 'Create the complete invitation flow.', desktop: true, mobile: true, states: true,
    }), admin);
    expect(started.refinement).toMatchObject({ kind: 'visual', status: 'queued', version: 1 });
    expect(started.refinement.brief).toContain('Make the pending state clearer.');
    await expect(Promise.resolve().then(() => taskShowroom.startTaskShowroomRun(taskId, taskShowroom.taskShowroomRunInput.parse({
      brief: 'Duplicate', desktop: true, mobile: false,
    }), admin))).rejects.toMatchObject({ statusCode: 409 });
  });

  test('hydrates the task worktree and publishes a generated version without overwriting', async () => {
    const worktree = path.join(root, 'worktree');
    mkdirSync(worktree, { recursive: true });
    await taskShowroom.hydrateTaskShowroomWorktree(projectFolder, worktree);
    expect(readFileSync(path.join(worktree, 'showroom/Flow/members.html'), 'utf8')).toContain('Members');

    const category = taskShowroom.taskShowroomCategory(taskKey, 'Team invitations');
    const versionRoot = path.join(worktree, 'showroom', category, 'v2');
    mkdirSync(path.join(versionRoot, 'assets'), { recursive: true });
    writeFileSync(path.join(versionRoot, 'index.html'), '<!doctype html><title>Generated</title><link rel="stylesheet" href="assets/app.css">');
    writeFileSync(path.join(versionRoot, 'assets/app.css'), 'body{color:teal}');
    const published = await taskShowroom.publishTaskShowroomBundle({
      taskId, projectId, projectFolderPath: projectFolder, taskKey, taskTitle: 'Team invitations',
      requestedBy: admin.id, version: 2, worktreeRoot: worktree, viewPaths: [`${category}/v2/index.html`],
    });
    expect(published.paths).toEqual([`${category}/v2/index.html`]);
    expect(readFileSync(path.join(projectFolder, 'showroom', category, 'v2/index.html'), 'utf8')).toContain('Generated');
    expect((await taskShowroom.getTaskShowroom(taskId, admin)).linkedViews.map(view => view.path)).toContain(`${category}/v2/index.html`);

    writeFileSync(path.join(worktree, 'showroom', category, 'v2/index.html'), '<title>Overwrite</title>');
    await expect(taskShowroom.publishTaskShowroomBundle({
      taskId, projectId, projectFolderPath: projectFolder, taskKey, taskTitle: 'Team invitations',
      requestedBy: admin.id, version: 2, worktreeRoot: worktree, viewPaths: [`${category}/v2/index.html`],
    })).rejects.toThrow('showroom_publish_conflict');
    expect(readFileSync(path.join(projectFolder, 'showroom', category, 'v2/index.html'), 'utf8')).toContain('Generated');
  });
});
