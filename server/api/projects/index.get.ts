import { requireUser } from '../../lib/security/auth';
import { listProjects } from '../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return { projects: listProjects(user) };
});
