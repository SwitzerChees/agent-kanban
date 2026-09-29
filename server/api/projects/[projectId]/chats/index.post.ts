import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  agentModel: z.enum(['gpt-6.1-sol', 'gpt-6-astra']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
  wikiPageId: z.string().uuid().nullable().optional(),
}).default({});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return createProjectChat(projectId, bodySchema.parse(await readBody(event)), user);
});
