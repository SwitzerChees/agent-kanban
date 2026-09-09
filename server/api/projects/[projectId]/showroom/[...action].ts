import { createError, getRouterParam } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { addShowroomCategory, addShowroomFeedback, createShowroomIteration, createShowroomShare, feedbackInput, iterationInput,
  listShowroomFeedback, listShowroomIterations, listShowroomShares, revokeShowroomShare, shareInput, updateShowroomFeedback } from '../../../../lib/showroom';
import { showroomBody, showroomRequest, showroomHandler } from '../../../../lib/showroom-http';
import { publishShowroomIteration } from '../../../../lib/showroom-publish';
export default showroomHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const action = getRouterParam(event, 'action')!;
  if (event.method === 'GET') {
    showroomRequest(event);
    if (action === 'shares') return listShowroomShares(projectId, user);
    if (action === 'feedback') return listShowroomFeedback(projectId, user);
    if (action === 'iterations') return listShowroomIterations(projectId, user);
  }
  if (event.method === 'POST' || event.method === 'PATCH' || event.method === 'DELETE') {
    const body = await showroomBody(event);
    if (event.method === 'POST' && action === 'categories') return addShowroomCategory(projectId, z.string().trim().min(1).max(100).parse(body.name), user);
    if (event.method === 'POST' && action === 'shares') return createShowroomShare(projectId, shareInput.parse(body), user);
    if (event.method === 'POST' && action === 'feedback') return addShowroomFeedback(projectId, feedbackInput.parse(body), user);
    if (event.method === 'POST' && action === 'iterations') return createShowroomIteration(projectId, iterationInput.parse(body), user);
    if (event.method === 'POST' && action.match(/^iterations\/[^/]+\/publish$/)) return publishShowroomIteration(projectId, action.split('/')[1]!, user);
    if (event.method === 'DELETE' && action.match(/^shares\/[^/]+$/)) return revokeShowroomShare(projectId, action.split('/')[1]!, user);
    if (event.method === 'PATCH' && action.match(/^feedback\/[^/]+$/)) return updateShowroomFeedback(projectId, action.split('/')[1]!, z.enum(['open', 'in_progress', 'resolved']).parse(body.status), user);
  }
  throw createError({ statusCode: 404 });
});
