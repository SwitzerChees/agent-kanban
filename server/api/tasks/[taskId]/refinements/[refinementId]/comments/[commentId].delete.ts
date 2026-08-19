import { getRouterParam } from 'h3';
import { deleteRefinementComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  const commentId = getRouterParam(event, 'commentId')!;
  return deleteRefinementComment(taskId, refinementId, commentId, user);
});
