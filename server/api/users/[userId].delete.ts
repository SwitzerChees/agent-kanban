import { getRouterParam } from 'h3';
import { requireAdmin } from '../../lib/security/auth';
import { deleteUser } from '../../lib/kanban';

export default defineEventHandler((event) => {
  const admin = requireAdmin(event);
  const userId = getRouterParam(event, 'userId')!;
  return { users: deleteUser(userId, admin) };
});
