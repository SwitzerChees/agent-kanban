import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateOberthema } from '../../lib/kanban';

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  color: z.enum(['teal', 'coral', 'amber', 'indigo', 'emerald']).optional(),
  position: z.number().int().min(0).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const oberthemaId = getRouterParam(event, 'oberthemaId')!;
  return { oberthema: updateOberthema(oberthemaId, schema.parse(await readBody(event)), user) };
});
