import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateTask } from '../../lib/kanban';

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  columnId: z.string().optional(),
  swimlaneId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  position: z.number().int().optional(),
  agentStatus: z.enum(['idle', 'queued', 'running', 'failed', 'done']).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  return { task: updateTask(taskId, schema.parse(await readBody(event)), user) };
});
