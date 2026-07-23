import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { applyTaskRefinement } from '../../../../../lib/refinements';
import { requireUser } from '../../../../../lib/security/auth';

const schema = z.object({
  mode: z.enum(['replace', 'append']).optional(),
  expectedTaskUpdatedAt: z.string().optional(),
  markdown: z.string().trim().min(1).max(200_000).optional(),
  allowDescriptionOverwrite: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  return applyTaskRefinement(taskId, refinementId, schema.parse(await readBody(event)), user);
});
