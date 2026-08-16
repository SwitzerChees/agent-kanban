import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { projectChatRuntime } from '../../../lib/project-chat-runtime';
import { requireSessionUser } from '../../../lib/security/auth';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(24_000),
  clientRequestId: z.string().trim().min(8).max(100).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const body = bodySchema.parse(await readBody(event));
  return projectChatRuntime().queueMessage(
    getRouterParam(event, 'chatId')!,
    body.message,
    body.clientRequestId ?? null,
    user,
  );
});
