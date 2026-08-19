import { createError, getHeader, getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { addTaskAttachments } from '../../../lib/kanban';
import { parseTaskUploadParts } from '../../../lib/task-upload';

function maxUploadBytes(): number {
  const parsed = Number.parseInt(process.env.KANBAN_MAX_UPLOAD_MB ?? '25', 10);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
  return mb * 1024 * 1024;
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const contentLength = Number(getHeader(event, 'content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxUploadBytes()) {
    throw createError({ statusCode: 413, statusMessage: 'upload_too_large' });
  }
  const parts = await readMultipartFormData(event);
  const { files } = parseTaskUploadParts(parts);
  return addTaskAttachments(taskId, files, user);
});
