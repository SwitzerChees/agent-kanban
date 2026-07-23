import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireAdmin } from '../../lib/security/auth';
import { updateUser } from '../../lib/kanban';

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(320).optional(),
  password: z.string().min(8).max(512).optional(),
  role: z.enum(['admin', 'member']).optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'user_update_empty',
});

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event);
  const userId = getRouterParam(event, 'userId')!;
  const body = updateUserSchema.parse(await readBody(event));
  return { users: updateUser(userId, body, admin) };
});
