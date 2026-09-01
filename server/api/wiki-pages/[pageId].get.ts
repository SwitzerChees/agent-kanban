import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { getWikiPage } from '../../lib/wiki';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return { page: getWikiPage(getRouterParam(event, 'pageId')!, user) };
});
