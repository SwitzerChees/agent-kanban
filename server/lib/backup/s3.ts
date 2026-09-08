import { createReadStream } from 'node:fs';
import path from 'node:path';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface BackupS3Config {
  bucket: string;
  prefix: string;
  endpoint?: string;
  forcePathStyle: boolean;
  serverSideEncryption?: ServerSideEncryption;
  kmsKeyId?: string;
  retentionCount: number;
}

export function backupS3Config(env: NodeJS.ProcessEnv = process.env): BackupS3Config | null {
  const bucket = env.KANBAN_BACKUP_S3_BUCKET?.trim();
  if (!bucket) return null;
  const encryption = env.KANBAN_BACKUP_S3_SSE?.trim();
  return {
    bucket,
    prefix: cleanPrefix(env.KANBAN_BACKUP_S3_PREFIX ?? 'agent-kanban'),
    endpoint: env.KANBAN_BACKUP_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: env.KANBAN_BACKUP_S3_FORCE_PATH_STYLE === '1' || env.KANBAN_BACKUP_S3_FORCE_PATH_STYLE === 'true',
    serverSideEncryption: encryption === 'AES256' || encryption === 'aws:kms' ? encryption : undefined,
    kmsKeyId: env.KANBAN_BACKUP_S3_KMS_KEY_ID?.trim() || undefined,
    retentionCount: retentionCount(env.KANBAN_BACKUP_S3_RETENTION_COUNT),
  };
}

export async function uploadBackupToS3(filePath: string, fileName: string, config = backupS3Config()) {
  if (!config) throw new Error('backup_s3_not_configured');
  const key = [config.prefix, path.basename(fileName)].filter(Boolean).join('/');
  const client = new S3Client({ endpoint: config.endpoint, forcePathStyle: config.forcePathStyle });
  const upload = new Upload({
    client,
    leavePartsOnError: false,
    params: {
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: 'application/zip',
      ServerSideEncryption: config.serverSideEncryption,
      SSEKMSKeyId: config.serverSideEncryption === 'aws:kms' ? config.kmsKeyId : undefined,
      Metadata: { 'agent-kanban-format': '1' },
    },
  });
  try {
    await upload.done();
    const deletedBackups = await rotateBackups(client, config, key);
    return { bucket: config.bucket, key, retentionCount: config.retentionCount, deletedBackups };
  } finally {
    client.destroy();
  }
}

function cleanPrefix(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function retentionCount(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '30', 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 30;
}

export async function rotateBackups(client: S3Client, config: BackupS3Config, uploadedKey: string) {
  const prefix = config.prefix ? `${config.prefix}/` : '';
  const objects: Array<{ key: string; modified: number }> = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      if (!object.Key || !isManagedBackupKey(object.Key, prefix)) continue;
      objects.push({ key: object.Key, modified: object.LastModified?.getTime() ?? timestampFromKey(object.Key) });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  objects.sort((left, right) => right.modified - left.modified || right.key.localeCompare(left.key));
  const stale = objects.slice(config.retentionCount).filter((object) => object.key !== uploadedKey);
  for (let offset = 0; offset < stale.length; offset += 1000) {
    const batch = stale.slice(offset, offset + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: { Quiet: true, Objects: batch.map((object) => ({ Key: object.key })) },
    }));
  }
  return stale.length;
}

function isManagedBackupKey(key: string, prefix: string) {
  const name = key.slice(prefix.length);
  return !name.includes('/') && /^agent-kanban-backup-\d{4}-\d{2}-\d{2}_.+\.zip$/.test(name);
}

function timestampFromKey(key: string) {
  const match = key.match(/agent-kanban-backup-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) : 0;
}
