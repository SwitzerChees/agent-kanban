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
  region?: string;
  forcePathStyle: boolean;
  serverSideEncryption?: ServerSideEncryption;
  kmsKeyId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  retentionCount: number;
  retentionDays?: number;
}

export function backupS3Config(env: NodeJS.ProcessEnv = process.env): BackupS3Config | null {
  const bucket = env.KANBAN_BACKUP_S3_BUCKET?.trim();
  if (!bucket) return null;
  const encryption = env.KANBAN_BACKUP_S3_SSE?.trim();
  return {
    bucket,
    prefix: cleanPrefix(env.KANBAN_BACKUP_S3_PREFIX ?? 'agent-kanban'),
    endpoint: env.KANBAN_BACKUP_S3_ENDPOINT?.trim() || undefined,
    region: env.KANBAN_BACKUP_S3_REGION?.trim() || undefined,
    forcePathStyle: env.KANBAN_BACKUP_S3_FORCE_PATH_STYLE === '1' || env.KANBAN_BACKUP_S3_FORCE_PATH_STYLE === 'true',
    serverSideEncryption: encryption === 'AES256' || encryption === 'aws:kms' ? encryption : undefined,
    kmsKeyId: env.KANBAN_BACKUP_S3_KMS_KEY_ID?.trim() || undefined,
    retentionCount: retentionCount(env.KANBAN_BACKUP_S3_RETENTION_COUNT),
  };
}

export async function uploadBackupToS3(filePath: string, fileName: string, config = backupS3Config()) {
  if (!config) throw new Error('backup_s3_not_configured');
  const key = [config.prefix, path.basename(fileName)].filter(Boolean).join('/');
  const client = createS3Client(config);
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
    return {
      bucket: config.bucket,
      key,
      retentionCount: config.retentionCount,
      retentionDays: config.retentionDays ?? null,
      deletedBackups,
    };
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
  const retentionCutoff = config.retentionDays
    ? Date.now() - config.retentionDays * 24 * 60 * 60 * 1000
    : null;
  const stale = objects.filter((object, index) => object.key !== uploadedKey && (
    index >= config.retentionCount
    || (retentionCutoff !== null && object.modified < retentionCutoff)
  ));
  for (let offset = 0; offset < stale.length; offset += 1000) {
    const batch = stale.slice(offset, offset + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: { Quiet: true, Objects: batch.map((object) => ({ Key: object.key })) },
    }));
  }
  return stale.length;
}

export async function testS3Connection(config: BackupS3Config) {
  const client = createS3Client(config);
  try {
    await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.prefix ? `${config.prefix}/` : undefined,
      MaxKeys: 1,
    }));
    return { ok: true };
  } finally {
    client.destroy();
  }
}

export function prefixWithDirectory(prefix: string, directory: string) {
  return [prefix, directory]
    .map(cleanPrefix)
    .filter(Boolean)
    .join('/');
}

function createS3Client(config: BackupS3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: config.accessKeyId && config.secretAccessKey ? {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    } : undefined,
  });
}

function isManagedBackupKey(key: string, prefix: string) {
  const name = key.slice(prefix.length);
  return !name.includes('/') && /^agent-kanban-backup-\d{4}-\d{2}-\d{2}_.+\.zip$/.test(name);
}

function timestampFromKey(key: string) {
  const match = key.match(/agent-kanban-backup-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) : 0;
}
