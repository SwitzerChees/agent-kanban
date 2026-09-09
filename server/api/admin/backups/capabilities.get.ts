import { requireAdminSession } from '../../../lib/security/auth';
import { currentBackupScope } from '../../../lib/backup/export';
import { backupS3Config } from '../../../lib/backup/s3';
import { listBackupDestinations } from '../../../lib/backup/settings';

export default defineEventHandler((event) => {
  requireAdminSession(event);
  const s3 = backupS3Config();
  const destinations = listBackupDestinations();
  return {
    scope: currentBackupScope(),
    destinations,
    s3: s3 ? {
      configured: true,
      bucket: s3.bucket,
      prefix: s3.prefix,
      encrypted: Boolean(s3.serverSideEncryption),
      retentionCount: s3.retentionCount,
    } : {
      configured: false,
      bucket: null,
      prefix: null,
      encrypted: false,
      retentionCount: null,
    },
  };
});
