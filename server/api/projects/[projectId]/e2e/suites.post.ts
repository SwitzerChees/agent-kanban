import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { createE2eSuite } from '../../../../lib/e2e-tests';

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(100_000).optional().nullable(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export default defineEventHandler(async (event) => ({
  suite: createE2eSuite(
    getRouterParam(event, 'projectId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
