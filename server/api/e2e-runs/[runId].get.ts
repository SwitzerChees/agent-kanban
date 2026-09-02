import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { getE2eRun } from '../../lib/e2e-tests';

export default defineEventHandler((event) => ({ run: getE2eRun(getRouterParam(event, 'runId')!, requireUser(event)) }));
