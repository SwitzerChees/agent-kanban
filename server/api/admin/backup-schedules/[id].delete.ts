import { getRouterParam } from 'h3';
import { deleteBackupSchedule } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  requireAdminSession(event);
  return deleteBackupSchedule(getRouterParam(event, 'id')!);
});
