import { requireAdmin } from '../../lib/security/auth';
import { listUsers } from '../../lib/kanban';

export default defineEventHandler((event) => {
  requireAdmin(event);
  return { users: listUsers() };
});
