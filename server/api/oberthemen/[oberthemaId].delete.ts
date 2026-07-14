import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteOberthema } from '../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return deleteOberthema(getRouterParam(event, 'oberthemaId')!, user);
});
