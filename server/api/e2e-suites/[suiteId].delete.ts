import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteE2eSuite } from '../../lib/e2e-tests';

export default defineEventHandler((event) => deleteE2eSuite(getRouterParam(event, 'suiteId')!, requireUser(event)));
