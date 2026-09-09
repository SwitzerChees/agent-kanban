import { readBody } from 'h3';
import { createBackupDestination, destinationInputSchema } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  return createBackupDestination(destinationInputSchema.parse(await readBody(event)));
});
