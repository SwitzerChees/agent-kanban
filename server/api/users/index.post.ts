import { createError, readBody } from 'h3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
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
  const email = body.email.toLowerCase();
  const existing = db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).get();
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'email_already_exists' });
  }
  const now = new Date().toISOString();
  try {
    db.insert(schema.users).values({
      id: randomUUID(),
      email,
      name: body.name.trim(),
      passwordHash: hashPassword(body.password),
      role: body.role,
      active: true,
      createdAt: now,
      updatedAt: now,
    }).run();
  } catch (error) {
    // The unique email index is the source of truth; the pre-check above is a
    // fast path, so a constraint error here is a concurrent duplicate create.
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw createError({ statusCode: 409, statusMessage: 'email_already_exists' });
    }
    throw error;
  }
  return { users: listUsers() };
});
