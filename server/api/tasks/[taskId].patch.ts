import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../lib/security/auth';
import { updateTask } from '../../lib/kanban';
import { AGENT_HARNESSES, CODEX_MODELS, TASK_REASONING_EFFORTS } from '../../lib/agent-harness';

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  descriptionSource: z.enum(['original', 'refined']).optional(),
  columnId: z.string().optional(),
  swimlaneId: z.string().optional().nullable(),
  oberthemaId: z.string().optional(),
  unterthemaId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  agentEnabled: z.boolean().optional(),
  agentHarness: z.enum(AGENT_HARNESSES).optional(),
  agentModel: z.enum(CODEX_MODELS).optional(),
  reasoningEffort: z.enum(TASK_REASONING_EFFORTS).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
  position: z.number().int().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  return { task: await updateTask(taskId, schema.parse(await readBody(event)), user) };
});
