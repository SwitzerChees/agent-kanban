import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../../lib/security/auth';
import { saveAttachmentAnnotation } from '../../../../../lib/kanban';

const schema = z.object({
  annotationData: z.unknown(),
  renderedImage: z.string().startsWith('data:image/png;base64,'),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const attachmentId = getRouterParam(event, 'attachmentId')!;
  const body = schema.parse(await readBody(event));
  const renderedImage = Buffer.from(body.renderedImage.split(',')[1] ?? '', 'base64');
  return saveAttachmentAnnotation(taskId, attachmentId, {
    annotationData: body.annotationData,
    renderedImage,
  }, user);
});
