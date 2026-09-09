import { getRouterParam } from 'h3';
import { addShowroomFeedback, authorizeShowroomShare, feedbackInput } from '../../../lib/showroom';
import { showroomBody, showroomHandler } from '../../../lib/showroom-http';
export default showroomHandler(async event => {
  const share = authorizeShowroomShare(getRouterParam(event, 'token')!);
  return addShowroomFeedback(share.projectId, feedbackInput.parse(await showroomBody(event)), undefined, share);
});
