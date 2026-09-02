import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { listProjectE2e, queueE2eCases, queueE2eSuite } from '../../../../lib/e2e-tests';

const bodySchema = z.object({
  suiteId: z.string().uuid().optional(),
  caseIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  targetRevision: z.string().min(1).max(200),
}).refine((value) => Boolean(value.suiteId) !== Boolean(value.caseIds), {
  message: 'provide_exactly_one_e2e_dispatch_target',
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const body = bodySchema.parse(await readBody(event));
  const catalog = listProjectE2e(projectId, user);
  if (body.suiteId) {
    if (!catalog.suites.some((suite) => suite.id === body.suiteId)) {
      throw createError({ statusCode: 400, statusMessage: 'e2e_dispatch_project_mismatch' });
    }
    return queueE2eSuite(body.suiteId, { targetRevision: body.targetRevision, triggerType: 'api' }, user);
  }
  if (body.caseIds!.some((caseId) => !catalog.cases.some((testCase) => testCase.id === caseId))) {
    throw createError({ statusCode: 400, statusMessage: 'e2e_dispatch_project_mismatch' });
  }
  return queueE2eCases(projectId, body.caseIds!, { targetRevision: body.targetRevision, triggerType: 'api' }, user);
});
