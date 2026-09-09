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

Administrators can create one or more named S3 destinations directly in
**Backup & Restore**. Each destination includes bucket, endpoint, region, base
directory, path-style mode, optional server-side encryption, and credentials.
The **Test connection** action verifies list access before saving.

Access and secret keys are AES-256-GCM encrypted outside SQLite below
`.data/secrets/backup-destinations`. The local master key is stored as
`.data/secrets/backup-config.key`; key and credential files are restricted to
mode `0600`. Neither credentials nor the master key are included in exported
backup ZIPs or API responses. Back up the master key separately if the local
S3 configuration itself must survive a complete server loss. Destinations
without explicit keys use the standard AWS SDK credential chain (for example
an instance role or web identity).

Schedules are also configured in **Backup & Restore**. They use a five-field
cron expression and an IANA time zone, and can be enabled, paused, edited,
deleted, or run immediately. The next and previous run plus the last result are
shown in the UI. On restart, interrupted runs are marked failed and enabled
schedules resume from their persisted next-run time.

The legacy environment configuration remains available as a fallback when
`KANBAN_BACKUP_S3_BUCKET` is present:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KANBAN_BACKUP_S3_BUCKET` | unset | Destination bucket; enables S3 upload |
| `KANBAN_BACKUP_S3_PREFIX` | `agent-kanban` | Object-key prefix |
| `KANBAN_BACKUP_S3_REGION` | SDK default | AWS region |
| `KANBAN_BACKUP_S3_ENDPOINT` | unset | Custom S3-compatible endpoint |
| `KANBAN_BACKUP_S3_FORCE_PATH_STYLE` | `false` | Use path-style bucket URLs |
| `KANBAN_BACKUP_S3_SSE` | unset | `AES256` or `aws:kms` server-side encryption |
| `KANBAN_BACKUP_S3_KMS_KEY_ID` | unset | KMS key ID when `aws:kms` is selected |
| `KANBAN_BACKUP_S3_RETENTION_COUNT` | `30` | Number of newest managed backups to keep |

Rotation runs after every successful S3 upload. A schedule has both retention
days and a maximum count; a managed backup is deleted when either limit is
exceeded. Deletions are batched in groups of up to 1,000. Rotation only manages
files whose basename matches `agent-kanban-backup-YYYY-MM-DD_….zip` directly in
the selected destination directory. Unrelated objects and nested keys are
never deleted.

The S3 identity needs `s3:PutObject`, `s3:ListBucket`, and `s3:DeleteObject`
for the configured bucket and prefix. Add KMS permissions as required when
using a customer-managed KMS key.

## Size limits

Imports accept archives up to 5 GiB and up to 20 GiB after extraction. The
limits can be lowered or raised with `KANBAN_BACKUP_MAX_ARCHIVE_BYTES` and
`KANBAN_BACKUP_MAX_UNCOMPRESSED_BYTES`. Both values are byte counts.
