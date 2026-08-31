import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateRefinementVisualComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

const schema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  resolved: z.boolean().optional(),
}).refine((value) => value.body !== undefined || value.resolved !== undefined);

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  return { comment: updateRefinementVisualComment(
    getRouterParam(event, 'taskId')!,
    getRouterParam(event, 'refinementId')!,
    getRouterParam(event, 'commentId')!,
    schema.parse(await readBody(event)),
    user,
  ) };
});
