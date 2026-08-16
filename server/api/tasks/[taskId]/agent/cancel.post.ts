import { getRouterParam } from 'h3';
import { cancelTaskAgent } from '../../../../lib/kanban';
import { abortLocalTask } from '../../../../lib/local-dispatcher';
import { requireUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const detail = cancelTaskAgent(taskId, user);
  abortLocalTask(taskId);
  return detail;
});
