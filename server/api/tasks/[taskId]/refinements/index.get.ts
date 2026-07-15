import { getRouterParam } from 'h3';
import { listTaskRefinements } from '../../../../lib/refinements';
import { requireUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  return { refinements: listTaskRefinements(taskId, user) };
});
