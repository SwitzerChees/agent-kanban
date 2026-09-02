import { createError, getHeader, getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { assertTaskUploadContentLength } from '../../../lib/upload-limits';
import { createWikiImage } from '../../../lib/wiki-images';

export default defineEventHandler(async (event) => {
  const contentLength = Number(getHeader(event, 'content-length') ?? 0);
  assertTaskUploadContentLength(contentLength);
  const parts = await readMultipartFormData(event);
  const files = (parts ?? []).filter((part) => part.filename);
  if (files.length !== 1) {
    throw createError({ statusCode: 400, statusMessage: 'one_wiki_image_required' });
  }
  const file = files[0]!;
  return {
    image: await createWikiImage(getRouterParam(event, 'pageId')!, {
      fileName: file.filename!,
      mimeType: file.type || 'application/octet-stream',
      data: Buffer.from(file.data),
    }, requireUser(event)),
  };
});
