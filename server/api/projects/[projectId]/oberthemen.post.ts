import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { createOberthema } from '../../../lib/kanban';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  color: z.enum(['teal', 'coral', 'amber', 'indigo', 'emerald']).optional(),
  position: z.number().int().min(0).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return { oberthema: createOberthema(projectId, schema.parse(await readBody(event)), user) };
});
