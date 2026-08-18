import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createError, getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { appDataDir } from '../../../../lib/db';
import { getProjectChatAttachment } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const chatId = getRouterParam(event, 'chatId')!;
  const attachment = getProjectChatAttachment(
    chatId,
    getRouterParam(event, 'attachmentId')!,
    requireSessionUser(event),
  );
  let realPath: string;
  let uploadRoot: string;
  try {
    realPath = realpathSync(attachment.storagePath);
    uploadRoot = realpathSync(appDataDir('chat-sessions', chatId, 'uploads'));
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'chat_attachment_not_found' });
  }
  const relative = path.relative(uploadRoot, realPath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !statSync(realPath).isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'chat_attachment_not_found' });
  }

  const inline = attachment.mimeType.startsWith('image/') && getQuery(event).download !== '1';
  const asciiName = attachment.fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'attachment';
  setHeader(event, 'content-type', attachment.mimeType || 'application/octet-stream');
  setHeader(event, 'content-length', attachment.size);
  const encodedName = encodeURIComponent(attachment.fileName).replace(/'/g, '%27');
  setHeader(event, 'content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  setHeader(event, 'cache-control', 'private, max-age=300');
  setHeader(event, 'x-content-type-options', 'nosniff');
  return sendStream(event, createReadStream(realPath));
});
