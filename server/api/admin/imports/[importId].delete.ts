import { getRouterParam } from 'h3';
import { cancelStagedImport } from '../../../lib/backup/import';
import { requireAdminSession } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  const admin = requireAdminSession(event);
  return cancelStagedImport(getRouterParam(event, 'importId')!, admin.id);
});
