import { createReadStream } from 'node:fs';
import path from 'node:path';
import { getQuery, getRouterParam, sendStream, setHeader } from 'h3';
import { requireUser } from '../../lib/security/auth';
import { getWikiImage } from '../../lib/wiki-images';

export default defineEventHandler((event) => {
  const { image } = getWikiImage(getRouterParam(event, 'imageId')!, requireUser(event));
  const useSource = getQuery(event).variant === 'source' || !image.renderedStoragePath;
  const storagePath = useSource ? image.storagePath : image.renderedStoragePath!;
  const fileName = useSource ? image.fileName : `${path.parse(image.fileName).name}-annotated.png`;
  const mimeType = useSource ? image.mimeType : 'image/png';
  const safeFileName = fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
  const encodedFileName = encodeURIComponent(fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  setHeader(event, 'content-type', mimeType);
  setHeader(event, 'content-disposition', `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
  setHeader(event, 'cache-control', 'private, no-store');
  setHeader(event, 'x-content-type-options', 'nosniff');
  return sendStream(event, createReadStream(storagePath));
});
