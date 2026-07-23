import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { addTaskComment, getTaskDetail } from '../../../lib/kanban';

const schema = z.object({
  body: z.string().min(1),
  mentionUserIds: z.array(z.string().uuid()).max(25).default([]),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const body = schema.parse(await readBody(event));
  addTaskComment(taskId, body.body, body.mentionUserIds, user);
  return getTaskDetail(taskId, user);
});
