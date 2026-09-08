import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { duplicateWikiPage } from '../../../lib/wiki';

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => duplicateWikiPage(
  getRouterParam(event, 'pageId')!,
  bodySchema.parse(await readBody(event)),
  requireUser(event),
));
