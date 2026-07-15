import { getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { addTaskAttachments } from '../../../lib/kanban';
import { parseTaskUploadParts } from '../../../lib/task-upload';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const parts = await readMultipartFormData(event);
  const { files } = parseTaskUploadParts(parts);
  return addTaskAttachments(taskId, files, user);
});
