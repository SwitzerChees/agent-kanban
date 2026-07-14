import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateUnterthema } from '../../lib/kanban';

const schema = z.object({
  oberthemaId: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  position: z.number().int().min(0).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const unterthemaId = getRouterParam(event, 'unterthemaId')!;
  return { unterthema: updateUnterthema(unterthemaId, schema.parse(await readBody(event)), user) };
});
