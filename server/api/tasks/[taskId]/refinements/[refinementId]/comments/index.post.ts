import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createRefinementComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

const schema = z.object({
  quote: z.string().trim().min(1).max(4000),
  prefix: z.string().max(500).optional().nullable(),
  suffix: z.string().max(500).optional().nullable(),
  startOffset: z.number().int().min(0).max(1_000_000),
  endOffset: z.number().int().min(1).max(1_000_000),
  body: z.string().trim().min(1).max(4000),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  return { comment: createRefinementComment(taskId, refinementId, schema.parse(await readBody(event)), user) };
});
