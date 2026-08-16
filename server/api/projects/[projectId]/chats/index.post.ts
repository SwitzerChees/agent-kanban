import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { createProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

const bodySchema = z.object({
  harness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'xhigh']).optional(),
}).default({});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return createProjectChat(projectId, bodySchema.parse(await readBody(event)), user);
});
