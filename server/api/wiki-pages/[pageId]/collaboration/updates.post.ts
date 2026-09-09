import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { applyWikiCollaborationUpdate } from '../../../../lib/wiki-collaboration';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  update: z.string().min(1).max(2_100_000),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const body = bodySchema.parse(await readBody(event));
  return applyWikiCollaborationUpdate(
    getRouterParam(event, 'pageId')!,
    body.sessionId,
    body.update,
    user,
  );
});
