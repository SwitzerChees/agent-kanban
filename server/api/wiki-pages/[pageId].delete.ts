import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteWikiPage } from '../../lib/wiki';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return deleteWikiPage(getRouterParam(event, 'pageId')!, user);
});
