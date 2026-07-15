import { createError } from 'h3';
import { z } from 'zod';

const MAX_RENDERED_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_ANNOTATION_DATA_BYTES = 1024 * 1024;
const MAX_RENDERED_IMAGE_CHARACTERS = Math.ceil(MAX_RENDERED_IMAGE_BYTES / 3) * 4 + 32;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const annotationPointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const annotationDataSchema = z.object({
  version: z.literal(1),
  strokes: z.array(z.object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    width: z.number().finite().min(1).max(48),
    points: z.array(annotationPointSchema).max(10_000),
  })).max(500),
});

export const renderedAnnotationImageSchema = z.string()
  .max(MAX_RENDERED_IMAGE_CHARACTERS)
  .regex(/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export function decodeRenderedAnnotationImage(
  renderedImage: string,
  annotationData: z.infer<typeof annotationDataSchema>,
  statusMessage = 'invalid_annotation_image',
) {
  let serializedAnnotation = '';
  try {
    serializedAnnotation = JSON.stringify(annotationData);
  } catch {
    throw createError({ statusCode: 400, statusMessage });
  }
  if (Buffer.byteLength(serializedAnnotation, 'utf8') > MAX_ANNOTATION_DATA_BYTES) {
    throw createError({ statusCode: 400, statusMessage });
  }

  const encodedImage = renderedImage.slice('data:image/png;base64,'.length);
  const decodedImage = Buffer.from(encodedImage, 'base64');
  if (
    !decodedImage.length
    || decodedImage.length > MAX_RENDERED_IMAGE_BYTES
    || decodedImage.length < PNG_SIGNATURE.length
    || !decodedImage.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw createError({ statusCode: 400, statusMessage });
  }
  return decodedImage;
}
