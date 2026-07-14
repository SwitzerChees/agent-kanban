import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteUnterthema } from '../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return deleteUnterthema(getRouterParam(event, 'unterthemaId')!, user);
});
