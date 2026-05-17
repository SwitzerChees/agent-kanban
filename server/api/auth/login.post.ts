import { createError, readBody } from 'h3';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../lib/db';
import { createSession } from '../../lib/security/auth';
import { verifyPassword } from '../../lib/security/password';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const body = loginSchema.parse(await readBody(event));
  const user = db.select().from(schema.users).where(eq(schema.users.email, body.email.toLowerCase())).get();
  if (!user || !user.active || !verifyPassword(body.password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' });
  }
  return { user: createSession(event, user.id) };
});
