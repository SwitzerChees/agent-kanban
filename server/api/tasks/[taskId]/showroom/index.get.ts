import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { getTaskShowroom } from '../../../../lib/task-showroom';
import { showroomRequest } from '../../../../lib/showroom-http';

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  showroomRequest(event);
  return getTaskShowroom(getRouterParam(event, 'taskId')!, user);
});
