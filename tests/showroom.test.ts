import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import type { User } from '../server/lib/db/schema';
import type { ShowroomLibrary } from '../shared/showroom';

const root = mkdtempSync(path.join(tmpdir(), 'agent-kanban-showroom-'));
process.env.KANBAN_DATA_DIR = path.join(root, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'showroom-tests@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'showroom-test-password';
let storage: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let showroom: typeof import('../server/lib/showroom');
let files: typeof import('../server/lib/showroom-files');
let publish: typeof import('../server/lib/showroom-publish');
let admin: User, member: User, outsider: User;
let projectId: string;
let library: ShowroomLibrary;
const projectFolder = path.join(root, 'project');
const html = '<!doctype html><html><head><title>Startseite</title><link rel="stylesheet" href="style.css"></head><body><nav id="nav">Home</nav><button id="cta">Start</button></body></html>';
function insertUser(name: string) {
  const row = { id: randomUUID(), email: name + '@example.com', name, passwordHash: 'unused', role: 'member' as const, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  storage.db.insert(storage.schema.users).values(row).run(); return row;
}
beforeAll(async () => {
  storage = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  showroom = await import('../server/lib/showroom');
  files = await import('../server/lib/showroom-files');
  publish = await import('../server/lib/showroom-publish');
  admin = storage.db.select().from(storage.schema.users).get()!;
  member = insertUser('member'); outsider = insertUser('outsider');
  const project = await kanban.createProject({ name: 'Showroom project', key: 'SHOW', folderPath: projectFolder, userIds: [member.id], agentConcurrencyLimit: 0 }, admin);
  projectId = project.id;
});
afterAll(() => { storage?.sqliteDatabase.close(); rmSync(root, { recursive: true, force: true }); });

describe('showroom repository library', () => {
  test('creates showroom for new projects and retains empty categories', async () => {
    expect(readFileSync(path.join(projectFolder, 'showroom/.gitkeep'), 'utf8')).toBe('');
    await showroom.addShowroomCategory(projectId, 'Startseite', member);
    await showroom.addShowroomCategory(projectId, 'Checkout', admin);
    const empty = await showroom.showroomLibrary(projectId, member);
    expect(empty.views).toEqual([]);
    expect(empty.categories).toEqual(['Checkout', 'Startseite']);
    await expect(showroom.addShowroomCategory(projectId, 'Startseite', admin)).rejects.toMatchObject({ statusCode: 409 });
  });
  test('blocks non-members, path traversal, dot files and symlink escapes', async () => {
    await expect(showroom.showroomLibrary(projectId, outsider)).rejects.toMatchObject({ statusCode: 403 });
    for (const bad of ['../outside', '/etc/passwd', 'a/../../b', '.env', 'a\\b', 'a%2fb', 'a?b', 'a\u0000b', 'a//b']) {
      expect(() => files.showroomPath(bad)).toThrow();
    }
    await expect(showroom.addShowroomCategory(projectId, '../bad', admin)).rejects.toMatchObject({ statusCode: 400 });
    writeFileSync(path.join(root, 'secret.html'), '<h1>Secret</h1>');
    symlinkSync(path.join(root, 'secret.html'), path.join(projectFolder, 'showroom/leak.html'));
    mkdirSync(path.join(root, 'external'));
    writeFileSync(path.join(root, 'external/file.html'), 'secret');
    symlinkSync(path.join(root, 'external'), path.join(projectFolder, 'showroom/External'));
    const result = await showroom.showroomLibrary(projectId, admin);
    expect(result.views).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });
  test('captures views and relative assets in immutable, deduplicated snapshots', async () => {
    writeFileSync(path.join(projectFolder, 'showroom/Startseite/index.html'), html);
    writeFileSync(path.join(projectFolder, 'showroom/Startseite/style.css'), 'body{color:teal}');
    writeFileSync(path.join(projectFolder, 'showroom/Checkout/cart.html'), '<title>Cart</title>');
    writeFileSync(path.join(projectFolder, 'showroom/.secret.html'), 'hidden');
    writeFileSync(path.join(projectFolder, 'showroom/Startseite/secret.pem'), 'hidden');
    library = await showroom.showroomLibrary(projectId, admin);
    expect(library.views).toHaveLength(2);
    expect(library.views.find(v => v.path === 'Startseite/index.html')?.title).toBe('Startseite');
    expect(showroom.showroomAsset(library.previewToken, 'Startseite/style.css').data.toString()).toBe('body{color:teal}');
    expect(() => showroom.showroomAsset(library.previewToken, '../.env')).toThrow();
    expect(() => showroom.showroomAsset(library.previewToken, 'Startseite/secret.pem')).toThrow();
    expect((await showroom.showroomLibrary(projectId, admin)).snapshotId).toBe(library.snapshotId);
    writeFileSync(path.join(projectFolder, 'showroom/Startseite/index.html'), html.replace('Startseite', 'Version 2'));
    writeFileSync(path.join(projectFolder, 'showroom/Startseite/style.css'), 'body{color:red}');
    const latest = await showroom.showroomLibrary(projectId, admin);
    expect(latest.snapshotId).not.toBe(library.snapshotId);
    expect(showroom.showroomAsset(library.previewToken, 'Startseite/index.html').data.toString()).toBe(html);
    expect(showroom.showroomAsset(library.previewToken, 'Startseite/style.css').data.toString()).toBe('body{color:teal}');
    expect((await showroom.showroomLibrary(projectId, admin, undefined, library.snapshotId)).views[1]?.title).toBe('Startseite');
  });
});

describe('share capabilities and guest feedback', () => {
  test('hashes tokens and restricts both views and assets to the shared category', async () => {
    const result = await showroom.createShowroomShare(projectId, showroom.shareInput.parse({ name: 'Client A', category: 'Startseite' }), member);
    const stored = storage.sqliteDatabase.prepare('SELECT token_hash FROM showroom_shares WHERE id = ?').get(result.share.id) as { token_hash: string };
    expect(stored.token_hash).toBe(files.digest(result.token));
    expect(JSON.stringify(showroom.listShowroomShares(projectId, admin))).not.toContain(result.token);
    const share = showroom.authorizeShowroomShare(result.token);
    const guest = await showroom.showroomLibrary(projectId, undefined, share);
    expect(guest.categories).toEqual(['Startseite']);
    expect(guest.views.map(v => v.path)).toEqual(['Startseite/index.html']);
    expect(guest.warnings).toEqual([]);
    expect(() => showroom.showroomAsset(guest.previewToken, 'Checkout/cart.html')).toThrow();
    expect(() => showroom.authorizeShowroomShare(guest.previewToken)).toThrow();
    expect(() => showroom.authorizeShowroomPreview(result.token)).toThrow();
  });
  test('allows account-free named feedback, validates anchors, and is idempotent', async () => {
    const result = await showroom.createShowroomShare(projectId, showroom.shareInput.parse({ name: 'Feedback client' }), admin);
    const share = showroom.authorizeShowroomShare(result.token);
    const guest = await showroom.showroomLibrary(projectId, undefined, share);
    const input = showroom.feedbackInput.parse({
      previewToken: guest.previewToken, viewPath: 'Startseite/index.html', authorName: '  Anna  ', body: 'Make the CTA clearer', requestId: randomUUID(),
      anchor: { kind: 'element', selector: '#cta', tag: 'button', text: 'Start', rect: { x: 20, y: 100, width: 80, height: 40 }, viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 } },
    });
    const created = showroom.addShowroomFeedback(projectId, input, undefined, share);
    expect(showroom.addShowroomFeedback(projectId, input, undefined, share)).toEqual(created);
    const comment = showroom.listShowroomFeedback(projectId, admin).find(f => f.id === created.id)!;
    expect(comment).toMatchObject({ authorName: 'Anna', body: input.body, snapshotId: guest.snapshotId, status: 'open', anchor: input.anchor });
    expect(() => showroom.feedbackInput.parse({ ...input, authorName: '   ' })).toThrow();
    expect(() => showroom.feedbackInput.parse({ ...input, anchor: { ...input.anchor, rect: { x: -1, y: 0, width: 1, height: 1 } } })).toThrow();
    expect(() => showroom.addShowroomFeedback(projectId, { ...input, previewToken: library.previewToken }, undefined, share)).toThrow();
    expect(() => showroom.listShowroomFeedback(projectId, outsider)).toThrow();
  });
  test('read-only, expired and revoked shares cannot submit; existing previews also revoke', async () => {
    const readOnly = await showroom.createShowroomShare(projectId, showroom.shareInput.parse({ name: 'Read only', canComment: false }), admin);
    const share = showroom.authorizeShowroomShare(readOnly.token);
    const guest = await showroom.showroomLibrary(projectId, undefined, share);
    const input = showroom.feedbackInput.parse({ previewToken: guest.previewToken, viewPath: 'Startseite/index.html', authorName: 'Guest', body: 'No', requestId: randomUUID() });
    expect(guest.canComment).toBe(false);
    expect(() => showroom.addShowroomFeedback(projectId, input, undefined, share)).toThrow();
    showroom.revokeShowroomShare(projectId, readOnly.share.id, member);
    expect(() => showroom.authorizeShowroomShare(readOnly.token)).toThrow();
    expect(() => showroom.showroomAsset(guest.previewToken, 'Startseite/index.html')).toThrow();
    const expiring = await showroom.createShowroomShare(projectId, showroom.shareInput.parse({ name: 'Expires' }), admin);
    storage.sqliteDatabase.prepare("UPDATE showroom_shares SET expires_at = '2000-01-01' WHERE id = ?").run(expiring.share.id);
    expect(() => showroom.authorizeShowroomShare(expiring.token)).toThrow();
    expect(() => showroom.revokeShowroomShare(projectId, expiring.share.id, outsider)).toThrow();
  });
  test('rechecks membership, active user and preview expiry on every resource request', async () => {
    const privateLibrary = await showroom.showroomLibrary(projectId, member);
    storage.db.update(storage.schema.users).set({ active: false }).where(eq(storage.schema.users.id, member.id)).run();
    expect(() => showroom.showroomAsset(privateLibrary.previewToken, 'Startseite/index.html')).toThrow();
    storage.db.update(storage.schema.users).set({ active: true }).where(eq(storage.schema.users.id, member.id)).run();
    storage.sqliteDatabase.prepare("UPDATE showroom_previews SET expires_at = '2000-01-01' WHERE token_hash = ?").run(files.digest(privateLibrary.previewToken));
    expect(() => showroom.authorizeShowroomPreview(privateLibrary.previewToken)).toThrow();
  });
});

describe('agent iterations', () => {
  test('creates a real, idempotent Kanban task with exact source and anchored feedback', async () => {
    const row = showroom.listShowroomFeedback(projectId, admin)[0]!;
    const input = showroom.iterationInput.parse({ requestId: randomUUID(), targetPath: 'Startseite/v3.html', sourcePath: row.viewPath, snapshotId: row.snapshotId, feedbackIds: [row.id], brief: 'Improve the CTA', start: false });
    const result = await showroom.createShowroomIteration(projectId, input, admin);
    const repeated = await showroom.createShowroomIteration(projectId, input, admin);
    expect(repeated.iteration.taskId).toBe(result.iteration.taskId);
    const task = kanban.getTaskDetail(result.iteration.taskId!, admin);
    expect(JSON.stringify(task)).toContain('Improve the CTA');
    expect(JSON.stringify(task)).toContain('#cta');
    expect(JSON.stringify(task)).toContain('showroom-source.json');
    expect(showroom.listShowroomFeedback(projectId, admin)[0]).toMatchObject({ status: 'in_progress', taskId: result.iteration.taskId });
    await expect(showroom.createShowroomIteration(projectId, { ...input, requestId: randomUUID(), targetPath: 'Startseite/another.html' }, admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(showroom.createShowroomIteration(projectId, { ...input, requestId: randomUUID(), feedbackIds: [], targetPath: 'Startseite/index.html' }, admin)).rejects.toMatchObject({ statusCode: 409 });
    showroom.updateShowroomFeedback(projectId, row.id, 'resolved', admin);
    expect(showroom.listShowroomFeedback(projectId, admin)[0]?.status).toBe('resolved');
    showroom.updateShowroomFeedback(projectId, row.id, 'open', admin);
  });
  test('publishes completed agent output without overwriting any existing version', async () => {
    const input = showroom.iterationInput.parse({ requestId: randomUUID(), targetPath: 'NewCategory/home.html', brief: 'Create a home', start: false });
    const { iteration } = await showroom.createShowroomIteration(projectId, input, admin);
    await expect(publish.publishShowroomIteration(projectId, iteration.id, admin)).rejects.toMatchObject({ statusCode: 409 });
    const worktree = storage.appDataDir('worktrees', projectId, iteration.taskId!, 'tree');
    mkdirSync(path.join(worktree, 'showroom/NewCategory/assets'), { recursive: true });
    writeFileSync(path.join(worktree, 'showroom/NewCategory/home.html'), '<title>New</title>');
    writeFileSync(path.join(worktree, 'showroom/NewCategory/assets/main.css'), 'body{color:navy}');
    storage.db.update(storage.schema.tasks).set({ agentStatus: 'done' }).where(eq(storage.schema.tasks.id, iteration.taskId!)).run();
    const result = await publish.publishShowroomIteration(projectId, iteration.id, admin);
    expect(result.files).toBe(2);
    expect(readFileSync(path.join(projectFolder, 'showroom/NewCategory/home.html'), 'utf8')).toBe('<title>New</title>');
    expect((await publish.publishShowroomIteration(projectId, iteration.id, admin)).files).toBe(0);
    writeFileSync(path.join(worktree, 'showroom/NewCategory/assets/main.css'), 'overwrite!');
    await expect(publish.publishShowroomIteration(projectId, iteration.id, admin)).rejects.toMatchObject({ statusCode: 409 });
    expect(readFileSync(path.join(projectFolder, 'showroom/NewCategory/assets/main.css'), 'utf8')).toBe('body{color:navy}');
    await expect(publish.publishShowroomIteration(projectId, iteration.id, outsider)).rejects.toMatchObject({ statusCode: 403 });
  });
  test('rejects symlink showroom roots without writing through them', async () => {
    const unsafe = path.join(root, 'unsafe');
    mkdirSync(unsafe);
    symlinkSync(path.join(root, 'external'), path.join(unsafe, 'showroom'));
    await expect(files.ensureShowroomFolder(unsafe)).rejects.toMatchObject({ statusCode: 409 });
  });
  test('publishes from the retained Git branch after clean worktree cleanup', async () => {
    const folder = path.join(root, 'retained-repo');
    mkdirSync(folder);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, stdio: 'pipe' });
    git('init', '-b', 'master');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'initial');
    const project = await kanban.createProject({ name: 'Retained branch', key: 'KEEP', folderPath: folder }, admin);
    const { iteration } = await showroom.createShowroomIteration(project.id, showroom.iterationInput.parse({
      requestId: randomUUID(), targetPath: 'Home/result.html', brief: 'Generate', start: false,
    }), admin);
    const { taskWorktreeBranch } = await import('../server/lib/git-workspaces');
    git('switch', '-c', taskWorktreeBranch(iteration.taskKey!, iteration.taskId!));
    mkdirSync(path.join(folder, 'showroom/Home'), { recursive: true });
    writeFileSync(path.join(folder, 'showroom/Home/result.html'), '<title>Retained</title>');
    git('add', 'showroom/Home/result.html');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'prototype');
    git('switch', 'master');
    storage.db.update(storage.schema.tasks).set({ agentStatus: 'done' }).where(eq(storage.schema.tasks.id, iteration.taskId!)).run();
    expect((await publish.publishShowroomIteration(project.id, iteration.id, admin)).files).toBe(1);
    expect(readFileSync(path.join(folder, 'showroom/Home/result.html'), 'utf8')).toBe('<title>Retained</title>');
  });
  test('project cascade removes feedback, snapshots and capability data together', async () => {
    const project = await kanban.createProject({ name: 'Disposable', key: 'DISP', folderPath: path.join(root, 'disposable') }, admin);
    const empty = await showroom.showroomLibrary(project.id, admin);
    storage.db.delete(storage.schema.projects).where(eq(storage.schema.projects.id, project.id)).run();
    expect(() => showroom.authorizeShowroomPreview(empty.previewToken)).toThrow();
    expect(storage.sqliteDatabase.pragma('foreign_key_check')).toEqual([]);
  });
});
