import { Readable } from 'node:stream';
import { createError, getHeader, getRequestWebStream } from 'h3';
import { stageImportArchive } from '../../../lib/backup/import';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  const admin = requireAdminSession(event);
  const contentType = getHeader(event, 'content-type')?.split(';')[0]?.trim();
  if (contentType !== 'application/zip' && contentType !== 'application/octet-stream') {
    throw createError({ statusCode: 415, statusMessage: 'backup_archive_content_type_required' });
  }
  const rawLength = getHeader(event, 'content-length');
  const contentLength = rawLength ? Number.parseInt(rawLength, 10) : undefined;
  const requestStream = getRequestWebStream(event);
  if (!requestStream) {
    throw createError({ statusCode: 400, statusMessage: 'backup_archive_missing' });
  }
  return stageImportArchive(Readable.fromWeb(requestStream), admin.id, contentLength);
});
