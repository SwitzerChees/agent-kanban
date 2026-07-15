import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../../lib/security/auth';
import { saveAttachmentAnnotation } from '../../../../../lib/kanban';
import {
  annotationDataSchema,
  decodeRenderedAnnotationImage,
  renderedAnnotationImageSchema,
} from '../../../../../lib/attachment-annotation';

const schema = z.object({
  annotationData: annotationDataSchema,
  renderedImage: renderedAnnotationImageSchema,
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const attachmentId = getRouterParam(event, 'attachmentId')!;
  const body = schema.parse(await readBody(event));
  return saveAttachmentAnnotation(taskId, attachmentId, {
    annotationData: body.annotationData,
    renderedImage: decodeRenderedAnnotationImage(body.renderedImage, body.annotationData),
  }, user);
});
