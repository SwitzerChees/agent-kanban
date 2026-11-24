import { AGENT_HARNESSES, AGENT_MODELS } from '../../../shared/agent-runtime';
import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { updateProjectChat } from '../../lib/project-chat';
import { requireSessionUser } from '../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(AGENT_HARNESSES).optional(),
  agentModel: z.enum(AGENT_MODELS).optional(),
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
