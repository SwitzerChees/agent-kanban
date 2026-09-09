import path from 'node:path';
import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { appDataDir } from '../../../../lib/db';
import { createBackupArchive } from '../../../../lib/backup/export';
import { applyStagedImport } from '../../../../lib/backup/import';
import { assertRuntimeIdle, beginMaintenance } from '../../../../lib/maintenance';
import { requireAdminSession } from '../../../../lib/security/auth';

const bodySchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1),
  folderPaths: z.record(z.string(), z.string()).optional(),
  confirmation: z.literal('IMPORT'),
}).strict();

export default defineEventHandler(async (event) => {
  const admin = requireAdminSession(event);
  const importId = getRouterParam(event, 'importId')!;
  const body = bodySchema.parse(await readBody(event));
  const releaseMaintenance = beginMaintenance('import');
  try {
    assertRuntimeIdle();
    const safetyDirectory = path.dirname(appDataDir('safety-backups', '.keep'));
    const safetyPath = path.join(safetyDirectory, `pre-import-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
    const safetyBackup = await createBackupArchive(safetyPath);
    await safetyBackup.cleanup();
    return await applyStagedImport({ importId, userId: admin.id, ...body });
  } finally {
    releaseMaintenance();
  }
});
