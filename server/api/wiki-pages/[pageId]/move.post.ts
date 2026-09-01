import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { moveWikiPage } from '../../../lib/wiki';

const bodySchema = z.object({
  parentId: z.string().uuid().nullable(),
  position: z.number().int().min(0).max(500),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  return moveWikiPage(
    getRouterParam(event, 'pageId')!,
    bodySchema.parse(await readBody(event)),
    user,
  );
});
