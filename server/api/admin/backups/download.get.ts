import { createReadStream } from 'node:fs';
import { sendStream, setHeader } from 'h3';
import { createBackupArchive } from '../../../lib/backup/export';
import { assertRuntimeIdle, beginMaintenance } from '../../../lib/maintenance';
import { requireAdminSession } from '../../../lib/security/auth';
import { registerServerStream } from '../../../lib/server-streams';

export default defineEventHandler(async (event) => {
  requireAdminSession(event);
  const releaseMaintenance = beginMaintenance('backup');
  let backup;
  try {
    assertRuntimeIdle();
    backup = await createBackupArchive();
  } finally {
    releaseMaintenance();
  }
  const stream = createReadStream(backup.path);
  const unregister = registerServerStream(() => stream.destroy());
  const cleanup = () => {
    unregister();
    void backup.cleanup();
  };
  stream.once('close', cleanup);
  stream.once('error', cleanup);
  event.node.req.once('aborted', () => stream.destroy());
  setHeader(event, 'content-type', 'application/zip');
  setHeader(event, 'content-disposition', contentDisposition(backup.fileName));
  setHeader(event, 'cache-control', 'private, no-store');
  return sendStream(event, stream);
});

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
