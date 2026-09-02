import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateWikiTodoItem } from '../../lib/wiki-todos';

const bodySchema = z.object({
  text: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
}).refine((value) => value.text !== undefined || value.completed !== undefined);

export default defineEventHandler(async (event) => ({
  item: updateWikiTodoItem(
    getRouterParam(event, 'itemId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
