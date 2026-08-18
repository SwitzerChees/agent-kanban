import { getRouterParam } from 'h3';
import { cancelTaskRefinement } from '../../../../../lib/refinements';
import { requireSessionUser } from '../../../../../lib/security/auth';

export default defineEventHandler((event) => ({
  refinement: cancelTaskRefinement(
    getRouterParam(event, 'taskId')!,
    getRouterParam(event, 'refinementId')!,
    requireSessionUser(event),
  ),
}));
