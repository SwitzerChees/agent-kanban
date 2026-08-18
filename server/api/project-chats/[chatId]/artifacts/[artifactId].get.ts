import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createError, getRouterParam, sendStream, setHeader } from 'h3';
import { appDataDir } from '../../../../lib/db';
import { authorizeProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

const IMAGE_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  const artifactId = getRouterParam(event, 'artifactId')!;
  const thread = authorizeProjectChat(chatId, user);
  let requestedPath: string;
  try {
    requestedPath = Buffer.from(artifactId, 'base64url').toString('utf8');
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'chat_artifact_not_found' });
  }

  const roots = [
    appDataDir('worktrees', thread.projectId, chatId, 'tree'),
    appDataDir('chat-sessions', chatId, 'artifacts'),
  ];
  let realPath: string;
  try {
    realPath = realpathSync(requestedPath);
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'chat_artifact_not_found' });
  }
  if (!roots.some((root) => isWithinPath(realPath, realpathOrResolved(root)))) {
    throw createError({ statusCode: 404, statusMessage: 'chat_artifact_not_found' });
  }
  const contentType = IMAGE_TYPES[path.extname(realPath).toLowerCase()];
  if (!contentType || !statSync(realPath).isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'chat_artifact_not_found' });
  }

  setHeader(event, 'content-type', contentType);
  setHeader(event, 'content-disposition', 'inline');
  setHeader(event, 'cache-control', 'private, max-age=300');
  setHeader(event, 'x-content-type-options', 'nosniff');
  return sendStream(event, createReadStream(realPath));
});

function realpathOrResolved(value: string) {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function isWithinPath(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
