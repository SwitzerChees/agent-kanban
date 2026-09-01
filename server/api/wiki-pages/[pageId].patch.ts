import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateWikiPage } from '../../lib/wiki';

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(1_000_000).optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).max(1_000_000_000).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
}).refine((value) => Object.keys(value).some((field) => field !== 'expectedUpdatedAt'));

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  return {
    page: updateWikiPage(
      getRouterParam(event, 'pageId')!,
      bodySchema.parse(await readBody(event)),
      user,
    ),
  };
});
