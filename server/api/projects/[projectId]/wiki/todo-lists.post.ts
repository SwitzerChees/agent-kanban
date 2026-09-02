import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { createWikiTodoList } from '../../../../lib/wiki-todos';

const bodySchema = z.object({ name: z.string().min(1).max(120) });

export default defineEventHandler(async (event) => ({
  list: createWikiTodoList(
    getRouterParam(event, 'projectId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
