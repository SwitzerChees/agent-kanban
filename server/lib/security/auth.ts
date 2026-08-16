import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createError, deleteCookie, getCookie, getHeader, type H3Event, setCookie } from 'h3';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db, schema } from '../db';
import type { User } from '../db/schema';

const COOKIE_NAME = 'ak_session';
const SESSION_DAYS = 14;
const API_TOKEN_PREFIX = 'ak_pat_';
const LAST_USED_WRITE_INTERVAL_MS = 15 * 60 * 1000;

type AuthenticationMethod = 'session' | 'api_token';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
}

export interface PublicApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
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
  const authorization = getHeader(event, 'authorization');
  if (authorization !== undefined) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const user = authenticateApiToken(match[1]!);
    if (user) setAuthenticationMethod(event, 'api_token');
    return user;
  }

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
  if (rows?.user) setAuthenticationMethod(event, 'session');
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

export function requireSessionUser(event: H3Event): User {
  const user = requireUser(event);
  if (getAuthenticationMethod(event) !== 'session') {
    throw createError({ statusCode: 403, statusMessage: 'session_required' });
  }
  return user;
}

export function createApiToken(userId: string, name: string, expiresInDays: 30 | 90 | 365 | null = 90) {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const token = `${API_TOKEN_PREFIX}${id}_${secret}`;
  const now = new Date();
  const expiresAt = expiresInDays === null
    ? null
    : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id,
    userId,
    name: name.trim(),
    tokenHash: hashToken(token),
    tokenPrefix: `${API_TOKEN_PREFIX}${id.slice(0, 8)}`,
    createdAt: now.toISOString(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  db.insert(schema.apiTokens).values(row).run();
  return { token, apiToken: toPublicApiToken(row) };
}

export function listApiTokens(userId: string): PublicApiToken[] {
  return db.select().from(schema.apiTokens)
    .where(and(
      eq(schema.apiTokens.userId, userId),
      isNull(schema.apiTokens.revokedAt),
      or(isNull(schema.apiTokens.expiresAt), gt(schema.apiTokens.expiresAt, new Date().toISOString())),
    ))
    .orderBy(desc(schema.apiTokens.createdAt))
    .all()
    .map(toPublicApiToken);
}

export function revokeApiToken(userId: string, tokenId: string) {
  const result = db.update(schema.apiTokens).set({ revokedAt: new Date().toISOString() })
    .where(and(
      eq(schema.apiTokens.id, tokenId),
      eq(schema.apiTokens.userId, userId),
      isNull(schema.apiTokens.revokedAt),
    ))
    .run();
  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'api_token_not_found' });
  }
  return { ok: true };
}

export function authenticateApiToken(token: string): User | null {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  const remainder = token.slice(API_TOKEN_PREFIX.length);
  const separator = remainder.indexOf('_');
  if (separator <= 0) return null;
  const id = remainder.slice(0, separator);
  const stored = db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).get();
  if (!stored || stored.revokedAt || (stored.expiresAt && stored.expiresAt <= new Date().toISOString())) return null;
  if (!safeHashEquals(stored.tokenHash, hashToken(token))) return null;

  const user = db.select().from(schema.users)
    .where(and(eq(schema.users.id, stored.userId), eq(schema.users.active, true)))
    .get();
  if (!user) return null;

  const lastUsedMs = stored.lastUsedAt ? Date.parse(stored.lastUsedAt) : 0;
  if (!lastUsedMs || Date.now() - lastUsedMs >= LAST_USED_WRITE_INTERVAL_MS) {
    db.update(schema.apiTokens).set({ lastUsedAt: new Date().toISOString() })
      .where(eq(schema.apiTokens.id, stored.id))
      .run();
  }
  return user;
}

function toPublicApiToken(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}): PublicApiToken {
  return {
    id: token.id,
    name: token.name,
    prefix: token.tokenPrefix,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
  };
}

function safeHashEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function setAuthenticationMethod(event: H3Event, method: AuthenticationMethod) {
  event.context.agentKanbanAuthMethod = method;
}

function getAuthenticationMethod(event: H3Event): AuthenticationMethod | undefined {
  return event.context.agentKanbanAuthMethod as AuthenticationMethod | undefined;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
