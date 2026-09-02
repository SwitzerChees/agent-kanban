import { createReadStream } from 'node:fs';
import { getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { getE2eRunArtifact } from '../../lib/e2e-tests';

export default defineEventHandler((event) => {
  const { artifact } = getE2eRunArtifact(getRouterParam(event, 'artifactId')!, requireUser(event));
  const disposition = getQuery(event).download === '1' ? 'attachment' : 'inline';
  const safeName = artifact.fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  setHeader(event, 'content-type', artifact.mimeType);
  setHeader(event, 'content-disposition', `${disposition}; filename="${safeName}"`);
  return sendStream(event, createReadStream(artifact.storagePath));
});
