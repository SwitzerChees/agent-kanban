import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteTask } from '../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  return deleteTask(taskId, user);
});
