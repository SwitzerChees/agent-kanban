import { readBody } from 'h3';
import { z } from 'zod';
import { createApiToken, requireSessionUser } from '../../../lib/security/auth';

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const input = schema.parse(await readBody(event));
  return createApiToken(user.id, input.name, input.expiresInDays);
});
