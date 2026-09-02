import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { deleteWikiTodoItem } from '../../lib/wiki-todos';

const bodySchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => ({
  item: deleteWikiTodoItem(
    getRouterParam(event, 'itemId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
