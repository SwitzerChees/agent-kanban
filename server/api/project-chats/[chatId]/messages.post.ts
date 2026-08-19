import { createError, getHeader, getRouterParam, readBody, readFormData } from 'h3';
import { z } from 'zod';
import {
  PROJECT_CHAT_MAX_TOTAL_ATTACHMENT_BYTES,
  projectChatRuntime,
  type UploadedProjectChatFile,
} from '../../../lib/project-chat-runtime';
import { formDataFiles, formDataText } from '../../../lib/form-data';
import { requireSessionUser } from '../../../lib/security/auth';

const bodySchema = z.object({
  message: z.string().trim().max(24_000).default(''),
  clientRequestId: z.string().trim().min(8).max(100).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  if ((getHeader(event, 'content-type') ?? '').includes('multipart/form-data')) {
    const contentLength = Number.parseInt(getHeader(event, 'content-length') || '0', 10);
    if (Number.isFinite(contentLength) && contentLength > PROJECT_CHAT_MAX_TOTAL_ATTACHMENT_BYTES + 1024 * 1024) {
      throw createError({ statusCode: 413, statusMessage: 'chat_attachments_too_large' });
    }
    const formData = await readFormData(event);
    const body = bodySchema.parse({
      message: formDataText(formData, 'message'),
      clientRequestId: formDataText(formData, 'clientRequestId') || null,
    });
    const files: UploadedProjectChatFile[] = await Promise.all(
      formDataFiles(formData, 'files').map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()),
      })),
    );
    return await projectChatRuntime().queueMessageWithAttachments(
      chatId,
      body.message,
      body.clientRequestId ?? null,
      files,
      user,
    );
  }

  const body = bodySchema.parse(await readBody(event));
  return projectChatRuntime().queueMessage(
    chatId,
    body.message,
    body.clientRequestId ?? null,
    user,
  );
});
