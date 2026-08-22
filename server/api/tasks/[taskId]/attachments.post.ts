import { getHeader, getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { addTaskAttachments } from '../../../lib/kanban';
import { parseTaskUploadParts } from '../../../lib/task-upload';
import { assertTaskUploadContentLength } from '../../../lib/upload-limits';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const contentLength = Number(getHeader(event, 'content-length') ?? 0);
  assertTaskUploadContentLength(contentLength);
  const parts = await readMultipartFormData(event);
  const { files } = parseTaskUploadParts(parts);
  return addTaskAttachments(taskId, files, user);
});
