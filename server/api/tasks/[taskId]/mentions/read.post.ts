import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { markTaskMentionsSeen } from '../../../../lib/kanban';
import { requireUser } from '../../../../lib/security/auth';

const schema = z.object({
  commentIds: z.array(z.string().uuid()).min(1).max(50),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const body = schema.parse(await readBody(event));
  return markTaskMentionsSeen(taskId, body.commentIds, user);
});
