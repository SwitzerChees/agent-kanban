import { getRouterParam } from 'h3';
import { queueBackupScheduleNow } from '../../../../lib/backup/scheduler';
import { requireAdminSession } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  requireAdminSession(event);
  return queueBackupScheduleNow(getRouterParam(event, 'id')!);
});
