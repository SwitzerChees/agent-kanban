import { readBody } from 'h3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, schema } from '../../lib/db';
import { requireAdmin } from '../../lib/security/auth';
import { hashPassword } from '../../lib/security/password';
import { listUsers } from '../../lib/kanban';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']).optional().default('member'),
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = createUserSchema.parse(await readBody(event));
  const now = new Date().toISOString();
  db.insert(schema.users).values({
    id: randomUUID(),
    email: body.email.toLowerCase(),
    name: body.name.trim(),
    passwordHash: hashPassword(body.password),
    role: body.role,
    active: true,
    createdAt: now,
    updatedAt: now,
  }).run();
  return { users: listUsers() };
});
