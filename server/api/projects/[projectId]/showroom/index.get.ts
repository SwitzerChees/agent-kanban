import { getQuery, getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { showroomLibrary } from '../../../../lib/showroom';
import { showroomRequest } from '../../../../lib/showroom-http';
export default defineEventHandler((event) => {
  const user = requireUser(event);
  showroomRequest(event);
  const snapshot = getQuery(event).snapshot;
  return showroomLibrary(getRouterParam(event, 'projectId')!, user, undefined, typeof snapshot === 'string' ? snapshot : undefined);
});
