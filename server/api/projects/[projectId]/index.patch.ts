import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireAdmin } from '../../../lib/security/auth';
import { getBoard, updateProject } from '../../../lib/kanban';

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().min(1).max(12).optional(),
  description: z.string().optional().nullable(),
  folderPath: z.string().min(1).optional(),
  userIds: z.array(z.string()).optional(),
});

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event);
  const projectId = getRouterParam(event, 'projectId')!;
  await updateProject(projectId, updateProjectSchema.parse(await readBody(event)), admin);
  return getBoard(projectId, admin);
});
