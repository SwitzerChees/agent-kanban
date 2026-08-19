import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { createSwimlane } from '../../../lib/kanban';

const schema = z.object({
  nameEn: z.string().min(1).max(100),
  nameDe: z.string().max(100).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return { swimlane: await createSwimlane(projectId, schema.parse(await readBody(event)), user) };
});
