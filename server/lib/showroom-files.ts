import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createError } from 'h3';

export const SHOWROOM_MIMES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export function showroomPath(value: string) {
  if (!value || value.length > 400 || /[\\\x00-\x1f\x7f%?#:]/.test(value)
    || value.split('/').some((part) => !part || part.startsWith('.') || part.trim() !== part)) {
    throw createError({ statusCode: 400, statusMessage: 'showroom_invalid_path' });
  }
  return value;
}
export function showroomCategory(value: string) {
  showroomPath(value);
  if (value.includes('/') || value.length > 100) throw createError({ statusCode: 400, statusMessage: 'showroom_invalid_category' });
  return value;
}
export async function ensureShowroomFolder(folderPath: string) {
  const projectRoot = await fs.realpath(folderPath);
  const root = path.join(projectRoot, 'showroom');
  await fs.mkdir(root, { recursive: true });
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw createError({ statusCode: 409, statusMessage: 'showroom_unsafe_directory' });
  // Exclusive creation never overwrites an existing repository file or follows a symlink.
  await fs.writeFile(path.join(root, '.gitkeep'), '', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  return root;
}
export async function createShowroomFolder(folderPath: string, category: string) {
  showroomCategory(category);
  const root = await ensureShowroomFolder(folderPath);
  const target = path.join(root, category);
  try { await fs.mkdir(target); } catch (error: any) {
    if (error.code === 'EEXIST') throw createError({ statusCode: 409, statusMessage: 'showroom_category_exists' });
    throw error;
  }
  await fs.writeFile(path.join(target, '.gitkeep'), '', { flag: 'wx' });
}
export async function readShowroomFiles(folderPath: string) {
  const root = await ensureShowroomFolder(folderPath);
  const files: Array<{ path: string; data: Buffer; hash: string; mime: string }> = [];
  const categories: string[] = [];
  const warnings: string[] = [];
  let total = 0;
  let entriesSeen = 0;
  async function walk(relative: string, depth: number) {
    if (depth > 8) { warnings.push(`${relative}: maximum folder depth exceeded`); return; }
    for (const entry of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (++entriesSeen > 4000) throw createError({ statusCode: 413, statusMessage: 'showroom_too_many_files' });
      if (entry.name.startsWith('.')) continue;
      const filePath = relative ? `${relative}/${entry.name}` : entry.name;
      try { showroomPath(filePath); } catch { warnings.push(`${filePath}: unsupported file name`); continue; }
      if (entry.isSymbolicLink()) { warnings.push(`${filePath}: symbolic link ignored`); continue; }
      if (entry.isDirectory()) {
        if (!relative) categories.push(entry.name);
        // Resolve parents again to detect directories replaced with links while scanning.
        if (await fs.realpath(path.join(root, filePath)) !== path.join(root, filePath)) continue;
        await walk(filePath, depth + 1); continue;
      }
      const mime = SHOWROOM_MIMES[path.extname(entry.name).toLowerCase()];
      if (!entry.isFile() || !mime) continue;
      const fullPath = path.join(root, filePath);
      if (await fs.realpath(fullPath) !== fullPath) continue;
      const handle = await fs.open(fullPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 10 * 1024 * 1024) { warnings.push(`${filePath}: file exceeds 10 MB`); continue; }
        const data = await handle.readFile();
        total += data.length;
        if (total > 64 * 1024 * 1024 || files.length >= 2000) throw createError({ statusCode: 413, statusMessage: 'showroom_too_large' });
        files.push({ path: filePath, data, hash: digest(data), mime });
      } finally { await handle.close(); }
    }
  }
  await walk('', 0);
  return { files, categories, warnings };
}
