import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireAdmin } from '../../../lib/security/auth';
import { addProjectUser, getBoard } from '../../../lib/kanban';

const schema = z.object({
  userId: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const body = schema.parse(await readBody(event));
  addProjectUser(projectId, body.userId, admin);
  return getBoard(projectId, admin);
});
