import { createHash, randomBytes } from 'node:crypto';
import { createError, deleteCookie, getCookie, type H3Event, setCookie } from 'h3';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db';
import type { User } from '../db/schema';

const COOKIE_NAME = 'ak_session';
const SESSION_DAYS = 14;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function createSession(event: H3Event, userId: string): PublicUser {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.insert(schema.sessions).values({
    id: tokenHash,
    userId,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  }).run();

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires,
  });

  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) throw createError({ statusCode: 500, statusMessage: 'session_user_missing' });
  return toPublicUser(user);
}

export function clearSession(event: H3Event) {
  const token = getCookie(event, COOKIE_NAME);
  if (token) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token))).run();
  }
  deleteCookie(event, COOKIE_NAME, { path: '/' });
}

export function getCurrentUser(event: H3Event): User | null {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;
  const now = new Date().toISOString();
  const rows = db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(
      eq(schema.sessions.id, hashToken(token)),
      gt(schema.sessions.expiresAt, now),
      eq(schema.users.active, true),
    ))
    .get();
  return rows?.user ?? null;
}

export function requireUser(event: H3Event): User {
  const user = getCurrentUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' });
  }
  return user;
}

export function requireAdmin(event: H3Event): User {
  const user = requireUser(event);
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'admin_required' });
  }
  return user;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
