import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { reorderHierarchy } from '../../../lib/kanban';

const schema = z.object({
  oberthemaIds: z.array(z.string().min(1)),
  unterthemen: z.array(z.object({
    oberthemaId: z.string().min(1),
    ids: z.array(z.string().min(1)),
  })),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return reorderHierarchy(projectId, schema.parse(await readBody(event)), user);
});
