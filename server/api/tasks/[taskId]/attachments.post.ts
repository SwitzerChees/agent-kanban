import { getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { addTaskAttachments, type UploadedTaskFile } from '../../../lib/kanban';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const parts = await readMultipartFormData(event);
  const files: UploadedTaskFile[] = [];
  for (const part of parts ?? []) {
    if (!part.name || !part.filename) continue;
    files.push({
      fileName: part.filename,
      mimeType: part.type || 'application/octet-stream',
      data: Buffer.from(part.data),
    });
  }
  return addTaskAttachments(taskId, files, user);
});
