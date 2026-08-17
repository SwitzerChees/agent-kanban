import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { renameTaskAttachment } from '../../../../lib/kanban';

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const attachmentId = getRouterParam(event, 'attachmentId')!;
  const { fileName } = schema.parse(await readBody(event));
  return renameTaskAttachment(taskId, attachmentId, fileName, user);
});
