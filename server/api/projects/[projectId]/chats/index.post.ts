import { AGENT_HARNESSES, AGENT_MODELS } from '../../../../../shared/agent-runtime';
import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(AGENT_HARNESSES).optional(),
  agentModel: z.enum(AGENT_MODELS).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
  wikiPageId: z.string().uuid().nullable().optional(),
}).default({});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return createProjectChat(projectId, bodySchema.parse(await readBody(event)), user);
});
