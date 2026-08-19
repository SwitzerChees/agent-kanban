import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateRefinementComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  const commentId = getRouterParam(event, 'commentId')!;
  return { comment: updateRefinementComment(taskId, refinementId, commentId, schema.parse(await readBody(event)).body, user) };
});
