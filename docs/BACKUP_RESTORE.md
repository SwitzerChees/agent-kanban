# Backup and restore

Administrators can open **Backup & Restore** from the application sidebar or
the command palette (`G`, then `R`). A backup can be downloaded directly or
uploaded to S3-compatible object storage. Imports always start with a preview;
no live data changes before the administrator selects projects, resolves any
missing project folders, and enters the confirmation text.

## Package contents

The ZIP package contains a versioned manifest, a consistent SQLite snapshot,
and files referenced by the database (task attachments and annotations, wiki
images, refinement artifacts, E2E assets and artifacts, and project-chat
uploads/artifacts). Repository checkouts, task worktrees, runtime sessions,
temporary data, cookies, and personal API tokens are excluded.

The importer verifies package paths, file sizes and SHA-256 checksums, the
SQLite integrity check, and the database-schema fingerprint. It invalidates
all sessions and personal API tokens after a successful import and normalizes
active runtime jobs to interrupted terminal states. A local safety backup is
created before any import is applied.

## S3 configuration and rotation

S3 upload is enabled when `KANBAN_BACKUP_S3_BUCKET` is present in the service
environment. AWS credentials use the standard AWS SDK credential chain (for
example an instance role, web identity, or `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`). Supported settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KANBAN_BACKUP_S3_BUCKET` | unset | Destination bucket; enables S3 upload |
| `KANBAN_BACKUP_S3_PREFIX` | `agent-kanban` | Object-key prefix |
| `AWS_REGION` | SDK default | AWS region |
| `KANBAN_BACKUP_S3_ENDPOINT` | unset | Custom S3-compatible endpoint |
| `KANBAN_BACKUP_S3_FORCE_PATH_STYLE` | `false` | Use path-style bucket URLs |
| `KANBAN_BACKUP_S3_SSE` | unset | `AES256` or `aws:kms` server-side encryption |
| `KANBAN_BACKUP_S3_KMS_KEY_ID` | unset | KMS key ID when `aws:kms` is selected |
| `KANBAN_BACKUP_S3_RETENTION_COUNT` | `30` | Number of newest managed backups to keep |

Rotation runs after every successful S3 upload. It lists the configured
prefix, orders managed backups by modification time, and deletes objects older
than the configured retention count in batches of up to 1,000. It only manages
files whose basename matches `agent-kanban-backup-YYYY-MM-DD_….zip`; unrelated
objects and nested keys below the prefix are never deleted.

The S3 identity needs `s3:PutObject`, `s3:ListBucket`, and `s3:DeleteObject`
for the configured bucket and prefix. Add KMS permissions as required when
using a customer-managed KMS key.

## Size limits

Imports accept archives up to 5 GiB and up to 20 GiB after extraction. The
limits can be lowered or raised with `KANBAN_BACKUP_MAX_ARCHIVE_BYTES` and
`KANBAN_BACKUP_MAX_UNCOMPRESSED_BYTES`. Both values are byte counts.
