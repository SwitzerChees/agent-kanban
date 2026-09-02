import { getRouterParam } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { abortE2eRun } from '../../../lib/e2e-dispatcher';
import { markQueuedE2eRunCancelled } from '../../../lib/e2e-tests';

export default defineEventHandler((event) => {
  const runId = getRouterParam(event, 'runId')!;
  const run = markQueuedE2eRunCancelled(runId, requireUser(event));
  abortE2eRun(runId);
  return { run };
});
