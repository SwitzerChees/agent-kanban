import { getRouterParam, readBody } from 'h3';
import { parseRefinementInput } from '../../../../lib/refinement-input';
import { createTaskRefinement } from '../../../../lib/refinements';
import { requireUser } from '../../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const body = parseRefinementInput(await readBody(event));
  return { refinement: createTaskRefinement(taskId, body, user) };
});
