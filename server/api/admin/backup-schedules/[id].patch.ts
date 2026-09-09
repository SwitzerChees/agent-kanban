import { getRouterParam, readBody } from 'h3';
import { nextBackupRun } from '../../../lib/backup/scheduler';
import { scheduleInputSchema, updateBackupSchedule } from '../../../lib/backup/settings';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  const input = scheduleInputSchema.parse(await readBody(event));
  return updateBackupSchedule(
    getRouterParam(event, 'id')!,
    input,
    nextBackupRun(input.cronExpression, input.timezone),
  );
});
