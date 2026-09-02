import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { addWikiTodoItem } from '../../../lib/wiki-todos';

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

export default defineEventHandler(async (event) => ({
  item: addWikiTodoItem(
    getRouterParam(event, 'listId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
