import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { renderedAnnotationImageSchema } from '../../../lib/attachment-annotation';
import { requireUser } from '../../../lib/security/auth';
import { wikiImageAnnotationSchema } from '../../../lib/wiki-image-annotation';
import { updateWikiImageAnnotation } from '../../../lib/wiki-images';

const bodySchema = z.object({
  annotationData: wikiImageAnnotationSchema,
  renderedImage: renderedAnnotationImageSchema,
  expectedUpdatedAt: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event));
  return {
    image: await updateWikiImageAnnotation(
      getRouterParam(event, 'imageId')!,
      body,
      requireUser(event),
    ),
  };
});
