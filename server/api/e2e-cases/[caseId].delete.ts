import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteE2eCase } from '../../lib/e2e-tests';

export default defineEventHandler((event) => deleteE2eCase(getRouterParam(event, 'caseId')!, requireUser(event)));
