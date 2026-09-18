import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createError } from 'h3';
import { z } from 'zod';
import type { User } from './db/schema';
import { sqliteDatabase as sql } from './db';
import { authorizeTaskAccess, logTaskActivity } from './kanban';
import { createTaskRefinement } from './refinements';
import { listShowroomFeedback, showroomLibrary } from './showroom';
import { digest, ensureShowroomFolder, readShowroomFiles, showroomCategory, showroomPath } from './showroom-files';
import type { ShowroomView, TaskShowroomData, TaskShowroomLink, TaskShowroomSpec } from '../../shared/showroom';

const now = () => new Date().toISOString();
const mapped = <T>(row: unknown): T => {
  if (!row) return row as T;
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) =>
    [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value])) as T;
};
const many = <T>(query: string, ...args: unknown[]) => sql.prepare(query).all(...args).map(row => mapped<T>(row));

export const taskShowroomLinkInput = z.object({
  kind: z.enum(['category', 'view']),
  targetPath: z.string().trim().min(1).max(400),
  mode: z.enum(['follow', 'pinned']).default('follow'),
  snapshotId: z.string().max(64).nullable().default(null),
});
export const taskShowroomSpecInput = z.object({
  paths: z.array(z.string().trim().min(1).max(400)).min(1).max(50),
  notes: z.string().trim().max(20_000).default(''),
});
export const taskShowroomRunInput = z.object({
  brief: z.string().trim().min(1).max(20_000),
  desktop: z.boolean().default(true),
  mobile: z.boolean().default(true),
  states: z.boolean().default(false),
});

function authorize(taskId: string, user: User) {
  const result = authorizeTaskAccess(taskId, user);
  return { task: result.task, project: result.project };
}

function listLinks(taskId: string): TaskShowroomLink[] {
  return many<TaskShowroomLink>(`SELECT id, task_id, project_id, kind, target_path, mode, snapshot_id, created_at
    FROM task_showroom_links WHERE task_id = ? ORDER BY created_at`, taskId);
}

function listSpecs(taskId: string): TaskShowroomSpec[] {
  return many<Omit<TaskShowroomSpec, 'entries' | 'active'> & { entriesJson: string; active: number }>(`SELECT id, task_id, project_id, version,
    snapshot_id, entries_json, notes, created_at, active FROM task_showroom_specs WHERE task_id = ? ORDER BY version DESC`, taskId)
    .map(row => ({ ...row, entries: JSON.parse(row.entriesJson), active: Boolean(row.active) }));
}

function linkedViews(views: ShowroomView[], links: TaskShowroomLink[]) {
  const seen = new Set<string>();
  return views.filter((view) => {
    const included = links.some(link => link.kind === 'view'
      ? link.targetPath === view.path
      : view.path === link.targetPath || view.path.startsWith(`${link.targetPath}/`));
    if (!included || seen.has(view.path)) return false;
    seen.add(view.path);
    return true;
  });
}

export async function getTaskShowroom(taskId: string, user: User): Promise<TaskShowroomData> {
  const { project } = authorize(taskId, user);
  const library = await showroomLibrary(project.id, user);
  const links = listLinks(taskId);
  const activeRun = mapped<TaskShowroomData['activeRun']>(sql.prepare(`SELECT id, version, status, error, brief
    FROM task_refinements WHERE task_id = ? AND kind = 'visual'
    ORDER BY version DESC LIMIT 1`).get(taskId)) || null;
  return {
    library,
    links,
    linkedViews: linkedViews(library.views, links),
    feedback: listShowroomFeedback(project.id, user).filter(row => row.taskId === taskId),
    specs: listSpecs(taskId),
    activeRun,
  };
}

export async function addTaskShowroomLink(taskId: string, input: z.infer<typeof taskShowroomLinkInput>, user: User) {
  const { task, project } = authorize(taskId, user);
  const parsed = taskShowroomLinkInput.parse(input);
  const library = await showroomLibrary(project.id, user, undefined, parsed.snapshotId || undefined);
  if (parsed.kind === 'view') {
    showroomPath(parsed.targetPath);
    if (!library.views.some(view => view.path === parsed.targetPath)) throw createError({ statusCode: 404, statusMessage: 'showroom_view_missing' });
  } else {
    showroomCategory(parsed.targetPath);
    if (!library.categories.includes(parsed.targetPath)) {
      throw createError({ statusCode: 404, statusMessage: 'showroom_category_missing' });
    }
  }
  const id = randomUUID();
  sql.prepare(`INSERT OR IGNORE INTO task_showroom_links
    (id, task_id, project_id, kind, target_path, mode, snapshot_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, taskId, project.id, parsed.kind, parsed.targetPath, parsed.mode,
      parsed.mode === 'pinned' ? library.snapshotId : null, user.id, now());
  logTaskActivity(project.id, task.id, user.id, 'task_showroom_linked', { kind: parsed.kind, targetPath: parsed.targetPath, mode: parsed.mode });
  return { links: listLinks(taskId) };
}

export function removeTaskShowroomLink(taskId: string, linkId: string, user: User) {
  const { task, project } = authorize(taskId, user);
  const row = mapped<TaskShowroomLink>(sql.prepare('SELECT * FROM task_showroom_links WHERE id = ? AND task_id = ?').get(linkId, taskId));
  if (!row) throw createError({ statusCode: 404, statusMessage: 'task_showroom_link_missing' });
  sql.prepare('DELETE FROM task_showroom_links WHERE id = ? AND task_id = ?').run(linkId, taskId);
  logTaskActivity(project.id, task.id, user.id, 'task_showroom_unlinked', { kind: row.kind, targetPath: row.targetPath });
  return { ok: true };
}

export async function createTaskShowroomSpec(taskId: string, input: z.infer<typeof taskShowroomSpecInput>, user: User) {
  const { task, project } = authorize(taskId, user);
  const parsed = taskShowroomSpecInput.parse(input);
  const library = await showroomLibrary(project.id, user);
  const requested = new Set(parsed.paths);
  const entries = library.views.filter(view => requested.has(view.path)).map(view => ({ path: view.path, title: view.title, hash: view.hash }));
  if (entries.length !== requested.size) throw createError({ statusCode: 409, statusMessage: 'task_showroom_spec_changed' });
  const version = Number((sql.prepare('SELECT COALESCE(MAX(version), 0) value FROM task_showroom_specs WHERE task_id = ?').get(taskId) as { value: number }).value) + 1;
  const id = randomUUID();
  sql.transaction(() => {
    sql.prepare('UPDATE task_showroom_specs SET active = 0 WHERE task_id = ?').run(taskId);
    sql.prepare(`INSERT INTO task_showroom_specs
      (id, task_id, project_id, version, snapshot_id, entries_json, notes, created_by, created_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(id, taskId, project.id, version, library.snapshotId, JSON.stringify(entries), parsed.notes, user.id, now());
  })();
  logTaskActivity(project.id, task.id, user.id, 'task_showroom_spec_created', { id, version, paths: [...requested] });
  return { spec: listSpecs(taskId).find(spec => spec.id === id)! };
}

export function startTaskShowroomRun(taskId: string, input: z.infer<typeof taskShowroomRunInput>, user: User) {
  const { task, project } = authorize(taskId, user);
  const parsed = taskShowroomRunInput.parse(input);
  if (!parsed.desktop && !parsed.mobile) throw createError({ statusCode: 400, statusMessage: 'showroom_viewport_required' });
  const feedback = listShowroomFeedback(project.id, user).filter(row => row.taskId === taskId && row.status !== 'resolved');
  const feedbackBrief = feedback.length
    ? ['Offenes Showroom-Feedback:', ...feedback.map(row => `- ${row.viewPath}: ${row.body}`)]
    : [];
  const brief = [parsed.brief, ...feedbackBrief].join('\n\n');
  const refinement = createTaskRefinement(taskId, {
    kind: 'visual', brief, visualSettings: { desktop: parsed.desktop, mobile: parsed.mobile, states: parsed.states },
  }, user);
  if (feedback.length) {
    const update = sql.prepare("UPDATE showroom_feedback SET status = 'in_progress' WHERE id = ? AND status = 'open'");
    for (const row of feedback) update.run(row.id);
  }
  logTaskActivity(project.id, task.id, user.id, 'task_showroom_run_started', { refinementId: refinement.id, feedbackIds: feedback.map(row => row.id) });
  return { refinement };
}

export function taskShowroomCategory(taskKey: string, taskTitle: string) {
  const slug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  return `${slug(taskKey)}-${slug(taskTitle) || 'entwurf'}`;
}

export async function hydrateTaskShowroomWorktree(projectFolderPath: string, worktreeRoot: string) {
  const sourceRoot = await fs.realpath(projectFolderPath);
  const targetProjectRoot = await fs.realpath(worktreeRoot);
  if (sourceRoot === targetProjectRoot) return;
  const { files } = await readShowroomFiles(sourceRoot);
  const targetRoot = await ensureShowroomFolder(targetProjectRoot);
  for (const file of files) {
    const destination = path.join(targetRoot, file.path);
    const exists = await fs.access(destination).then(() => true, () => false);
    if (exists) continue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (await fs.realpath(path.dirname(destination)) !== path.dirname(destination)) {
      throw new Error(`showroom_unsafe_directory:${file.path}`);
    }
    await fs.writeFile(destination, file.data, { flag: 'wx' });
  }
}

export async function publishTaskShowroomBundle(input: {
  taskId: string; projectId: string; projectFolderPath: string; taskKey: string; taskTitle: string;
  requestedBy: string; version: number; worktreeRoot: string; viewPaths: string[];
}) {
  const category = taskShowroomCategory(input.taskKey, input.taskTitle);
  const prefix = `${category}/v${input.version}/`;
  for (const viewPath of input.viewPaths) {
    showroomPath(viewPath);
    if (!viewPath.startsWith(prefix) || !/\.html?$/i.test(viewPath)) throw new Error(`showroom_view_outside_version:${viewPath}`);
  }
  const { files } = await readShowroomFiles(input.worktreeRoot);
  const selected = files.filter(file => file.path.startsWith(prefix));
  if (!selected.length || input.viewPaths.some(viewPath => !selected.some(file => file.path === viewPath))) {
    throw new Error('showroom_bundle_incomplete');
  }
  const root = await ensureShowroomFolder(input.projectFolderPath);
  for (const file of selected) {
    const destination = path.join(root, file.path);
    try {
      const info = await fs.lstat(destination);
      if (info.isSymbolicLink() || !info.isFile() || digest(await fs.readFile(destination)) !== file.hash) {
        throw new Error(`showroom_publish_conflict:${file.path}`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const additions = [] as typeof selected;
  for (const file of selected) {
    const destination = path.join(root, file.path);
    const exists = await fs.access(destination).then(() => true, () => false);
    if (!exists) additions.push(file);
  }
  additions.sort((a, b) => Number(/\.html?$/i.test(a.path)) - Number(/\.html?$/i.test(b.path)));
  for (const file of additions) {
    const destination = path.join(root, file.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (await fs.realpath(path.dirname(destination)) !== path.dirname(destination)) throw new Error(`showroom_unsafe_directory:${file.path}`);
    await fs.writeFile(destination, file.data, { flag: 'wx' });
  }
  sql.prepare(`INSERT OR IGNORE INTO task_showroom_links
    (id, task_id, project_id, kind, target_path, mode, snapshot_id, created_by, created_at)
    VALUES (?, ?, ?, 'category', ?, 'follow', NULL, ?, ?)`)
    .run(randomUUID(), input.taskId, input.projectId, category, input.requestedBy, now());
  logTaskActivity(input.projectId, input.taskId, input.requestedBy, 'task_showroom_published', {
    category, version: input.version, views: input.viewPaths, files: additions.map(file => file.path),
  });
  return { category, paths: input.viewPaths };
}
