import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createWikiCollaborationSession } from '../../../../lib/wiki-collaboration';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  clientId: z.string().min(1).max(120),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const body = bodySchema.parse(await readBody(event));
  return createWikiCollaborationSession(getRouterParam(event, 'pageId')!, body.clientId, user);
});
