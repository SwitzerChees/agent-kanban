import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createRefinementVisualComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

const schema = z.object({
  scope: z.enum(['view', 'all']),
  artifactId: z.string().uuid().optional().nullable(),
  x: z.number().int().min(0).max(10_000).optional().nullable(),
  y: z.number().int().min(0).max(10_000).optional().nullable(),
  body: z.string().trim().min(1).max(4000),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  return { comment: createRefinementVisualComment(taskId, refinementId, schema.parse(await readBody(event)), user) };
});
