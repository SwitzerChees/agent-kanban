import { createError, readBody } from 'h3';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../lib/db';
import { createSession } from '../../lib/security/auth';
import { hashPassword, needsRehash, verifyPassword } from '../../lib/security/password';
import {
  accountIpKey,
  checkRateLimit,
  clientIpKey,
  LOGIN_ACCOUNT_MAX_ATTEMPTS,
  LOGIN_IP_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
} from '../../lib/security/rate-limit';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const body = loginSchema.parse(await readBody(event));
  const ipKey = clientIpKey(event);
  const accountKey = accountIpKey(event, body.email);
  for (const [key, maxAttempts] of [
    [ipKey, LOGIN_IP_MAX_ATTEMPTS],
    [accountKey, LOGIN_ACCOUNT_MAX_ATTEMPTS],
  ] as const) {
    const decision = checkRateLimit(key, maxAttempts, LOGIN_WINDOW_MS);
    if (!decision.allowed) {
      // h3 errors have no header payload in this version; set it on the
      // underlying response before the error is serialized.
      event.node.res.setHeader('Retry-After', String(Math.ceil(decision.retryAfterMs / 1000)));
      throw createError({
        statusCode: 429,
        statusMessage: 'too_many_login_attempts',
      });
    }
  }
  const user = db.select().from(schema.users).where(eq(schema.users.email, body.email.toLowerCase())).get();
  if (!user || !user.active || !verifyPassword(body.password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' });
  }
  // Transparently upgrade hashes created before explicit scrypt parameters
  // were stored, so every login gradually migrates to the current cost.
  if (needsRehash(user.passwordHash)) {
    db.update(schema.users).set({ passwordHash: hashPassword(body.password) })
      .where(eq(schema.users.id, user.id)).run();
  }
  return { user: createSession(event, user.id) };
});
