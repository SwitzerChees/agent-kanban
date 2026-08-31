import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createTaskRefinement } from '../../../../lib/refinements';
import { requireUser } from '../../../../lib/security/auth';

const schema = z.object({
  kind: z.enum(['text', 'visual']).optional(),
  brief: z.string().max(4000).optional().nullable(),
  visualMode: z.enum(['auto', 'off', 'force']).optional(),
  parentRefinementId: z.string().uuid().optional().nullable(),
  visualSettings: z.object({
    desktop: z.boolean().optional(),
    mobile: z.boolean().optional(),
    states: z.boolean().optional(),
  }).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const body = schema.parse(await readBody(event));
  return { refinement: createTaskRefinement(taskId, body, user) };
});
