import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { closeWikiCollaborationSession } from '../../../../lib/wiki-collaboration';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({ sessionId: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const body = bodySchema.parse(await readBody(event));
  return closeWikiCollaborationSession(getRouterParam(event, 'pageId')!, body.sessionId, user);
});
