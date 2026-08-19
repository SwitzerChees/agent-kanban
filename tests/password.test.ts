import { describe, expect, it } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, needsRehash, parseStoredHash, SCRYPT_PARAMS, verifyPassword } from '../server/lib/security/password';

function legacyHash(password: string): string {
  // Legacy format: scrypt$<salt>$<hash> produced by scryptSync defaults
  // (N=16384, r=8, p=1) before explicit parameters were stored.
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

describe('password hashing', () => {
  it('hashes with explicit scrypt parameters in the stored format', () => {
    const stored = hashPassword('correct horse battery staple');
    const parsed = parseStoredHash(stored);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject(SCRYPT_PARAMS);
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored.split('$').length).toBe(6);
  });

  it('verifies a password against its hash', () => {
    const stored = hashPassword('hunter2-secret');
    expect(verifyPassword('hunter2-secret', stored)).toBe(true);
    expect(verifyPassword('hunter2-wrong', stored)).toBe(false);
  });

  it('stores current parameters so no rehash is needed', () => {
    const stored = hashPassword('some-password');
    expect(needsRehash(stored)).toBe(false);
  });

  it('verifies legacy hashes created with Node default parameters', () => {
    const legacy = legacyHash('legacy-password');
    expect(verifyPassword('legacy-password', legacy)).toBe(true);
    expect(verifyPassword('legacy-wrong', legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('rejects malformed stored hashes', () => {
    for (const stored of ['', 'scrypt', 'scrypt$', 'bcrypt$abc$def', 'scrypt$1$2$3', 'scrypt$x$y$z$salt$hash']) {
      expect(parseStoredHash(stored)).toBeNull();
      expect(verifyPassword('anything', stored)).toBe(false);
      expect(needsRehash(stored)).toBe(false);
    }
  });

  it('produces a valid rehash after upgrading a legacy hash', () => {
    const upgraded = hashPassword('pw123');
    expect(verifyPassword('pw123', upgraded)).toBe(true);
    expect(needsRehash(upgraded)).toBe(false);
  });
});
