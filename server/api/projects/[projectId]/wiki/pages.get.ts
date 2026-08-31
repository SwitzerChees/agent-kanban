import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { listWikiPages } from '../../../../lib/wiki';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return { pages: listWikiPages(getRouterParam(event, 'projectId')!, user) };
});
