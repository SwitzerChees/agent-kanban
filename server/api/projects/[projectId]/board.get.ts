import { getRouterParam } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { getBoard } from '../../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return getBoard(projectId, user);
});
