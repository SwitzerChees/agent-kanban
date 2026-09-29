import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateProjectChat } from '../../lib/project-chat';
import { requireSessionUser } from '../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  agentModel: z.enum(['gpt-6.1-sol', 'gpt-6-astra']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
}).refine((value) => value.harness !== undefined || value.agentModel !== undefined || value.reasoningEffort !== undefined);

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  return updateProjectChat(
    getRouterParam(event, 'chatId')!,
    bodySchema.parse(await readBody(event)),
    user,
  );
});
