import { getRouterParam } from 'h3';
import { authorizeShowroomShare, showroomLibrary } from '../../lib/showroom';
import { showroomRequest } from '../../lib/showroom-http';
export default defineEventHandler(event => {
  showroomRequest(event);
  const share = authorizeShowroomShare(getRouterParam(event, 'token')!);
  return showroomLibrary(share.projectId, undefined, share);
});
