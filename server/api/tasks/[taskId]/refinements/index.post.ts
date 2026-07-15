import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createTaskRefinement } from '../../../../lib/refinements';
import { requireUser } from '../../../../lib/security/auth';

const schema = z.object({
  brief: z.string().max(4000).optional().nullable(),
  visualMode: z.enum(['auto', 'off', 'force']).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const body = schema.parse(await readBody(event));
  return { refinement: createTaskRefinement(taskId, body, user) };
});
