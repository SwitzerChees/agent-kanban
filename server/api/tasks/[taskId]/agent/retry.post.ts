import { getRouterParam } from 'h3';
import { queueTaskAgent } from '../../../../lib/kanban';
import { requireUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return queueTaskAgent(getRouterParam(event, 'taskId')!, user, 'api_retry');
});
