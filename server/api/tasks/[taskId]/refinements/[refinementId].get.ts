import { getRouterParam } from 'h3';
import { getTaskRefinement } from '../../../../lib/refinements';
import { requireUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  return { refinement: getTaskRefinement(taskId, refinementId, user) };
});
