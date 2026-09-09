import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateWikiCollaborationPresence } from '../../../../lib/wiki-collaboration';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  editing: z.boolean(),
  blockId: z.string().min(1).max(120).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const body = bodySchema.parse(await readBody(event));
  return updateWikiCollaborationPresence(
    getRouterParam(event, 'pageId')!,
    body.sessionId,
    { editing: body.editing, blockId: body.blockId },
    user,
  );
});
