import { readBody } from 'h3';
import { z } from 'zod';
import { requireAdmin } from '../../lib/security/auth';
import { createProject } from '../../lib/kanban';

const createProjectSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1).max(12),
  description: z.string().optional().nullable(),
  folderPath: z.string().min(1),
  userIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  agentConcurrencyLimit: z.number().int().min(0).max(100).optional(),
  agentHarnessLimits: z.object({
    codex: z.number().int().min(0).max(100),
    opencode: z.number().int().min(0).max(100),
    'prime-agent': z.number().int().min(0).max(100),
  }).optional(),
});

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event);
  const body = createProjectSchema.parse(await readBody(event));
  const board = await createProject(body, admin);
  return { project: board };
});
