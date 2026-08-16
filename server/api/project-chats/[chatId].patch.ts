import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateProjectChat } from '../../lib/project-chat';
import { requireSessionUser } from '../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'xhigh']).optional(),
}).refine((value) => value.harness !== undefined || value.reasoningEffort !== undefined);

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  return updateProjectChat(
    getRouterParam(event, 'chatId')!,
    bodySchema.parse(await readBody(event)),
    user,
  );
});
