import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createError } from 'h3';
import { appDataDir, sqliteDatabase as sql } from './db';
import { getProject, logTaskActivity } from './kanban';
import type { User } from './db/schema';
import { digest, ensureShowroomFolder, readShowroomFiles, showroomPath, SHOWROOM_MIMES } from './showroom-files';
import { taskWorktreeBranch } from './git-workspaces';

const run = promisify(execFile);
async function readRetainedBranch(projectFolder: string, taskId: string, taskKey: string) {
  const branch = taskWorktreeBranch(taskKey, taskId);
  const { stdout } = await run('git', ['ls-tree', '-r', '-z', branch, '--', 'showroom/'], { cwd: projectFolder, maxBuffer: 2 * 1024 * 1024 });
  const files: Awaited<ReturnType<typeof readShowroomFiles>>['files'] = [];
  let total = 0;
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const match = entry.match(/^100(?:644|755) blob ([a-f0-9]+)\tshowroom\/(.+)$/s);
    if (!match) continue; // No symlinks or Git submodules.
    const filePath = match[2]!;
    try { showroomPath(filePath); } catch { continue; }
    const mime = SHOWROOM_MIMES[path.extname(filePath).toLowerCase()];
    if (!mime) continue;
    if (files.length >= 2000) throw createError({ statusCode: 413, statusMessage: 'showroom_too_many_files' });
    const { stdout: data } = await run('git', ['cat-file', 'blob', match[1]!], { cwd: projectFolder, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
    total += data.length;
    if (total > 64 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'showroom_too_large' });
    files.push({ path: filePath, data, mime, hash: digest(data) });
  }
  return { files };
}

const publishing = new Set<string>();
export async function publishShowroomIteration(projectId: string, iterationId: string, user: User) {
  const project = getProject(projectId, user);
  const iteration = sql.prepare(`SELECT i.*, t.agent_status, t.key task_key FROM showroom_iterations i JOIN tasks t ON t.id = i.task_id
    WHERE i.id = ? AND i.project_id = ?`).get(iterationId, projectId) as { task_id: string; task_key: string; target_path: string; agent_status: string } | undefined;
  if (!iteration) throw createError({ statusCode: 404, statusMessage: 'showroom_iteration_missing' });
  if (iteration.agent_status !== 'done') throw createError({ statusCode: 409, statusMessage: 'showroom_iteration_not_ready' });
  if (publishing.has(projectId)) throw createError({ statusCode: 409, statusMessage: 'showroom_publish_in_progress' });
  publishing.add(projectId);
  try {
    // Use the existing task worktree; never change its branch or copy unrelated app code.
    const worktree = appDataDir('worktrees', projectId, iteration.task_id, 'tree');
    const exists = await fs.access(worktree).then(() => true, () => false);
    const { files } = exists ? await readShowroomFiles(worktree)
      : await readRetainedBranch(project.folderPath, iteration.task_id, iteration.task_key).catch(() => {
        throw createError({ statusCode: 409, statusMessage: 'showroom_worktree_missing_reopen_task' });
      });
    const target = files.find(file => file.path === iteration.target_path);
    if (!target) throw createError({ statusCode: 409, statusMessage: 'showroom_result_missing' });
    const category = iteration.target_path.split('/')[0]!;
    const root = await ensureShowroomFolder(project.folderPath);
    const selected = files.filter(file => file.path.startsWith(category + '/') && (!/\.html?$/i.test(file.path) || file.path === target.path));
    const additions: typeof files = [];
    // Preflight every target. Existing differing resources are a conflict, not an overwrite.
    for (const file of selected) {
      showroomPath(file.path);
      let parent = root;
      for (const segment of file.path.split('/').slice(0, -1)) {
        parent = path.join(parent, segment);
        try {
          const stat = await fs.lstat(parent);
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw createError({ statusCode: 409, statusMessage: 'showroom_unsafe_directory' });
        } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
      }
      try {
        const destination = path.join(root, file.path);
        const stat = await fs.lstat(destination);
        if (stat.isSymbolicLink() || !stat.isFile() || digest(await fs.readFile(destination)) !== file.hash) {
          throw createError({ statusCode: 409, statusMessage: 'showroom_publish_conflict', data: { path: file.path } });
        }
      } catch (error: any) { if (error.code === 'ENOENT') additions.push(file); else throw error; }
    }
    // Assets first; the new HTML appears in the gallery only once its resources exist.
    additions.sort((a, b) => Number(a.path === target.path) - Number(b.path === target.path));
    for (const file of additions) {
      const destination = path.join(root, file.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (await fs.realpath(path.dirname(destination)) !== path.dirname(destination)) throw createError({ statusCode: 409, statusMessage: 'showroom_unsafe_directory' });
      await fs.writeFile(destination, file.data, { flag: 'wx' });
    }
    logTaskActivity(projectId, iteration.task_id, user.id, 'showroom_iteration_published', { iterationId, targetPath: target.path, files: additions.map(file => file.path) });
    return { ok: true, targetPath: target.path, files: additions.length };
  } finally { publishing.delete(projectId); }
}
