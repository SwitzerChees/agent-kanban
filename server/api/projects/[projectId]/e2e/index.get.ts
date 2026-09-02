import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { listProjectE2e } from '../../../../lib/e2e-tests';

export default defineEventHandler((event) => (
  listProjectE2e(getRouterParam(event, 'projectId')!, requireUser(event))
));
