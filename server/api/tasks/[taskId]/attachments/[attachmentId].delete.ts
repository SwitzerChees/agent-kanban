import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { deleteTaskAttachment } from '../../../../lib/kanban';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const attachmentId = getRouterParam(event, 'attachmentId')!;
  return deleteTaskAttachment(taskId, attachmentId, user);
});
