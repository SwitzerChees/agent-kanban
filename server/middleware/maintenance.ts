import { createError, getRequestURL } from 'h3';
import { isMaintenanceMode, maintenanceKind } from '../lib/maintenance';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export default defineEventHandler((event) => {
  if (!isMaintenanceMode() || !MUTATING_METHODS.has(event.method)) return;
  const pathname = getRequestURL(event).pathname;
  if (pathname.startsWith('/api/admin/backups') || pathname.startsWith('/api/admin/imports')) return;
  throw createError({
    statusCode: 503,
    statusMessage: 'maintenance_in_progress',
    data: { kind: maintenanceKind() },
  });
});
