import { getRouterParam, readBody } from 'h3';
import { destinationInputSchema, updateBackupDestination } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  return updateBackupDestination(
    getRouterParam(event, 'id')!,
    destinationInputSchema.parse(await readBody(event)),
  );
});
