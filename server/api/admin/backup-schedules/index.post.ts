import { readBody } from 'h3';
import { nextBackupRun } from '../../../lib/backup/scheduler';
import { insertBackupSchedule, scheduleInputSchema } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  const input = scheduleInputSchema.parse(await readBody(event));
  return insertBackupSchedule(input, nextBackupRun(input.cronExpression, input.timezone));
});
