import { createReadStream } from 'node:fs';
import { getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { getE2eCaseAsset } from '../../lib/e2e-tests';

export default defineEventHandler((event) => {
  const { asset } = getE2eCaseAsset(getRouterParam(event, 'assetId')!, requireUser(event));
  const disposition = getQuery(event).download === '1' ? 'attachment' : 'inline';
  const safeName = asset.fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  setHeader(event, 'content-type', asset.mimeType);
  setHeader(event, 'content-disposition', `${disposition}; filename="${safeName}"`);
  return sendStream(event, createReadStream(asset.storagePath));
});
