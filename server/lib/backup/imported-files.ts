import { realpathSync } from 'node:fs';
import path from 'node:path';
import { appDataRoot } from '../db';

export function isImportedProjectFile(candidate: string, projectId: string) {
  const root = realpathOrResolved(path.join(appDataRoot(), 'imported-files'));
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const [importId, importedProjectId, kind, fileName, ...extra] = relative.split(path.sep);
  return /^[0-9a-f-]{36}$/i.test(importId ?? '')
    && importedProjectId === projectId
    && Boolean(kind)
    && Boolean(fileName)
    && extra.length === 0;
}

function realpathOrResolved(value: string) {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}
