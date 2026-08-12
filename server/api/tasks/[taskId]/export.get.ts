import { getRouterParam, sendStream, setHeader } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { createTaskExportArchive } from '../../../lib/task-export';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const { fileName, stream } = createTaskExportArchive(taskId, user);
  const safeFileName = fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  const encodedFileName = encodeURIComponent(fileName)
    .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

  setHeader(event, 'content-type', 'application/zip');
  setHeader(event, 'content-disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
  setHeader(event, 'cache-control', 'private, no-store');
  event.node.req.once('aborted', () => stream.abort());
  return sendStream(event, stream);
});
