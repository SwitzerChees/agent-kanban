import { createReadStream } from 'node:fs';
import { getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { getTaskRefinementArtifact } from '../../../../../../lib/refinements';
import { requireUser } from '../../../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const artifact = getTaskRefinementArtifact(
    getRouterParam(event, 'taskId')!,
    getRouterParam(event, 'refinementId')!,
    getRouterParam(event, 'artifactId')!,
    requireUser(event),
  );
  const disposition = getQuery(event).download === '1' ? 'attachment' : 'inline';
  const safeFileName = artifact.fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  setHeader(event, 'content-type', artifact.mimeType);
  setHeader(event, 'content-disposition', `${disposition}; filename="${safeFileName}"`);
  return sendStream(event, createReadStream(artifact.storagePath));
});
