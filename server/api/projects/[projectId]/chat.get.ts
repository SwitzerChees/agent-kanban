import { getQuery, getRouterParam } from 'h3';
import { z } from 'zod';
import { getCurrentProjectChat } from '../../../lib/project-chat';
import { requireSessionUser } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const query = z.object({ wikiPageId: z.string().uuid().optional() }).parse(getQuery(event));
  return getCurrentProjectChat(projectId, user, query.wikiPageId ?? null);
});
