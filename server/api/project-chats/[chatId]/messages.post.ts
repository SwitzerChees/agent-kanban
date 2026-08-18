import { createError, getHeader, getRouterParam, readBody, readMultipartFormData } from 'h3';
import { z } from 'zod';
import {
  PROJECT_CHAT_MAX_TOTAL_ATTACHMENT_BYTES,
  projectChatRuntime,
  type UploadedProjectChatFile,
} from '../../../lib/project-chat-runtime';
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
    const parts = await readMultipartFormData(event);
    const body = bodySchema.parse({
      message: partText(parts, 'message'),
      clientRequestId: partText(parts, 'clientRequestId') || null,
    });
    const files: UploadedProjectChatFile[] = (parts ?? [])
      .filter((part) => part.name === 'files' && part.filename)
      .map((part) => ({
        fileName: part.filename!,
        mimeType: part.type || 'application/octet-stream',
        data: Buffer.from(part.data),
      }));
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

function partText(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  const part = parts?.find((candidate) => candidate.name === name && !candidate.filename);
  return part?.data ? Buffer.from(part.data).toString('utf8') : '';
}
