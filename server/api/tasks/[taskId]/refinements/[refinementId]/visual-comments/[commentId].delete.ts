import { getRouterParam } from 'h3';
import { deleteRefinementVisualComment } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

export default defineEventHandler((event) => deleteRefinementVisualComment(
  getRouterParam(event, 'taskId')!,
  getRouterParam(event, 'refinementId')!,
  getRouterParam(event, 'commentId')!,
  requireUser(event),
));
