import { readBody } from 'h3';
import { z } from 'zod';
import { backupDestinationConfig, destinationInputSchema } from '../../../lib/backup/settings';
import { testS3Connection, type BackupS3Config } from '../../../lib/backup/s3';
import { requireAdminSession } from '../../../lib/security/auth';

const testSchema = z.object({
  id: z.string().uuid().optional(),
  destination: destinationInputSchema,
}).strict();

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  const { id, destination } = testSchema.parse(await readBody(event));
  const saved = id && !destination.clearCredentials ? backupDestinationConfig(id) : null;
  const config: BackupS3Config = {
    bucket: destination.bucket,
    prefix: destination.prefix,
    endpoint: destination.endpoint || undefined,
    region: destination.region,
    forcePathStyle: destination.forcePathStyle,
    serverSideEncryption: destination.serverSideEncryption || undefined,
    kmsKeyId: destination.kmsKeyId || undefined,
    accessKeyId: destination.accessKeyId || saved?.accessKeyId,
    secretAccessKey: destination.secretAccessKey || saved?.secretAccessKey,
    retentionCount: 1,
  };
  return testS3Connection(config);
});
