import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { createWikiPage } from '../../../../lib/wiki';

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(1_000_000).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const page = createWikiPage(
    getRouterParam(event, 'projectId')!,
    bodySchema.parse(await readBody(event)),
    user,
  );
  return { page };
});
