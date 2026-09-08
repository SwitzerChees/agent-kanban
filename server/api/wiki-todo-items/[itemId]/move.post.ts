import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { moveWikiTodoItem } from '../../../lib/wiki-todos';

const bodySchema = z.object({
  position: z.number().int().min(0).max(500),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => moveWikiTodoItem(
  getRouterParam(event, 'itemId')!,
  bodySchema.parse(await readBody(event)),
  requireUser(event),
));
