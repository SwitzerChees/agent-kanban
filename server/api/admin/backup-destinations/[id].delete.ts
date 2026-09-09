import { getRouterParam } from 'h3';
import { deleteBackupDestination } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  requireAdminSession(event);
  return deleteBackupDestination(getRouterParam(event, 'id')!);
});
