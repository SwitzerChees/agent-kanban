import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateE2eSuite } from '../../lib/e2e-tests';

const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(100_000).optional().nullable(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => ({
  suite: updateE2eSuite(
    getRouterParam(event, 'suiteId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
