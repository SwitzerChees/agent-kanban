import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-api-tokens-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'api-token-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'api-token-test-password';

let dbModule: typeof import('../server/lib/db');
let auth: typeof import('../server/lib/security/auth');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  auth = await import('../server/lib/security/auth');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('personal API tokens', () => {
  test('stores only a hash and authenticates as the owning user', () => {
    const created = auth.createApiToken(admin.id, 'Harness', 90);

    expect(created.token).toMatch(/^ak_pat_[0-9a-f-]+_[A-Za-z0-9_-]+$/);
    expect(created.apiToken).toMatchObject({ name: 'Harness', lastUsedAt: null });
    expect(created.apiToken).not.toHaveProperty('tokenHash');

    const stored = dbModule.db.select().from(dbModule.schema.apiTokens)
      .where(eq(dbModule.schema.apiTokens.id, created.apiToken.id)).get();
    expect(stored?.tokenHash).not.toContain(created.token);
    expect(stored?.tokenPrefix).toBe(created.apiToken.prefix);
    expect(auth.authenticateApiToken(created.token)?.id).toBe(admin.id);
    expect(dbModule.db.select().from(dbModule.schema.apiTokens)
      .where(eq(dbModule.schema.apiTokens.id, created.apiToken.id)).get()?.lastUsedAt).toBeTruthy();
  });

  test('rejects malformed, expired, and revoked tokens', () => {
    expect(auth.authenticateApiToken('not-a-token')).toBeNull();

    const expired = auth.createApiToken(admin.id, 'Expired', 30);
    dbModule.db.update(dbModule.schema.apiTokens)
      .set({ expiresAt: '2000-01-01T00:00:00.000Z' })
      .where(eq(dbModule.schema.apiTokens.id, expired.apiToken.id))
      .run();
    expect(auth.authenticateApiToken(expired.token)).toBeNull();
    expect(auth.listApiTokens(admin.id).map((token) => token.id)).not.toContain(expired.apiToken.id);

    const revoked = auth.createApiToken(admin.id, 'Revoked', null);
    expect(auth.listApiTokens(admin.id).map((token) => token.id)).toContain(revoked.apiToken.id);
    expect(auth.revokeApiToken(admin.id, revoked.apiToken.id)).toEqual({ ok: true });
    expect(auth.authenticateApiToken(revoked.token)).toBeNull();
    expect(auth.listApiTokens(admin.id).map((token) => token.id)).not.toContain(revoked.apiToken.id);
  });
});
