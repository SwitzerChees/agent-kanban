import { createError } from 'h3';
import { createBackupArchive } from '../../../lib/backup/export';
import { backupS3Config, uploadBackupToS3 } from '../../../lib/backup/s3';
import { assertRuntimeIdle, beginMaintenance } from '../../../lib/maintenance';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  const config = backupS3Config();
  if (!config) throw createError({ statusCode: 503, statusMessage: 'backup_s3_not_configured' });
  const releaseMaintenance = beginMaintenance('backup');
  try {
    assertRuntimeIdle();
    const backup = await createBackupArchive();
    try {
      return { ok: true, fileName: backup.fileName, ...(await uploadBackupToS3(backup.path, backup.fileName, config)) };
    } finally {
      await backup.cleanup();
    }
  } finally {
    releaseMaintenance();
  }
});
