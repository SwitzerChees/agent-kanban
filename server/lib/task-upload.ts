import { createError, type MultiPartData } from 'h3';
import { z } from 'zod';
import type { UploadedTaskFile } from './kanban';
import {
  annotationDataSchema,
  decodeRenderedAnnotationImage,
  renderedAnnotationImageSchema,
} from './attachment-annotation';
import { maxTaskUploadBytes } from './upload-limits';

const annotationSchema = z.array(z.object({
  index: z.number().int().nonnegative(),
  annotationData: annotationDataSchema,
  renderedImage: renderedAnnotationImageSchema,
})).max(20);

export const MAX_UPLOAD_FILES = 20;

export function parseTaskUploadParts(parts: MultiPartData[] | undefined, maxFileBytes = maxTaskUploadBytes()) {
  const fields = new Map<string, string>();
  const files: UploadedTaskFile[] = [];

  for (const part of parts ?? []) {
    if (!part.name) continue;
    if (part.filename) {
      files.push({
        fileName: part.filename,
        mimeType: part.type || 'application/octet-stream',
        data: Buffer.from(part.data),
      });
      continue;
    }
    fields.set(part.name, Buffer.from(part.data).toString('utf8'));
  }

  if (files.length > MAX_UPLOAD_FILES) {
    throw createError({ statusCode: 400, statusMessage: 'too_many_files' });
  }
  if (files.reduce((total, file) => total + file.data.byteLength, 0) > maxFileBytes) {
    throw createError({ statusCode: 413, statusMessage: 'upload_too_large' });
  }

  const rawAnnotations = fields.get('annotations');
  if (!rawAnnotations) return { fields, files };

  let annotations: z.infer<typeof annotationSchema>;
  try {
    annotations = annotationSchema.parse(JSON.parse(rawAnnotations));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_upload_annotations' });
  }

  const seenIndexes = new Set<number>();
  for (const annotation of annotations) {
    const file = files[annotation.index];
    if (!file || seenIndexes.has(annotation.index) || !file.mimeType.startsWith('image/')) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_upload_annotations' });
    }
    seenIndexes.add(annotation.index);
    file.annotation = {
      data: annotation.annotationData,
      renderedImage: decodeRenderedAnnotationImage(
        annotation.renderedImage,
        annotation.annotationData,
        'invalid_upload_annotations',
      ),
    };
  }

  return { fields, files };
}
