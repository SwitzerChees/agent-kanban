import { getRouterParam } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { deleteE2eCaseAsset } from '../../lib/e2e-tests';

export default defineEventHandler((event) => deleteE2eCaseAsset(getRouterParam(event, 'assetId')!, requireUser(event)));
