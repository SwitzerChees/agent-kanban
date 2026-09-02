import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { queueE2eCase } from '../../../lib/e2e-tests';

const bodySchema = z.object({ targetRevision: z.string().max(200).optional().nullable() }).default({});

export default defineEventHandler(async (event) => ({
  run: queueE2eCase(
    getRouterParam(event, 'caseId')!,
    { ...bodySchema.parse(await readBody(event).catch(() => ({}))), triggerType: 'manual' },
    requireUser(event),
  ),
}));
