import { createReadStream } from 'node:fs';
import path from 'node:path';
import { getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { getTaskAttachment } from '../../../../lib/kanban';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const attachmentId = getRouterParam(event, 'attachmentId')!;
  const { attachment, annotation } = getTaskAttachment(taskId, attachmentId, user);
  const useAnnotated = getQuery(event).variant === 'annotated' && annotation;
  const storagePath = useAnnotated ? annotation.renderedStoragePath : attachment.storagePath;
  const fileName = useAnnotated
    ? `${path.parse(attachment.fileName).name}-annotated.png`
    : attachment.fileName;

  setHeader(event, 'content-type', useAnnotated ? 'image/png' : attachment.mimeType);
  setHeader(event, 'content-disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
  return sendStream(event, createReadStream(storagePath));
});
