import { getQuery } from 'h3';
import { requireUser } from '../lib/security/auth';
import { getCommandPaletteIndex } from '../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const projectId = getQuery(event).projectId;
  return getCommandPaletteIndex(user, typeof projectId === 'string' ? projectId : null);
});
