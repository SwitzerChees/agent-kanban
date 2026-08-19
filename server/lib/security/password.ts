import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Current scrypt parameters. Node's scryptSync is bound to OpenSSL's 32 MiB
 * maxmem default (the working set is 128 * N * r bytes, which must stay
 * below the cap), so at r = 8 the highest usable cost is N = 2^14. Keeping
 * the parameters explicit in the hash format documents the cost and makes a
 * future upgrade to a stronger KDF or higher parameters a transparent
 * rehash instead of a migration script.
 */
export const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;

/** Parameters used before explicit parameters were stored in the hash. */
const LEGACY_SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;

interface ScryptHash {
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
  /** True for the old `scrypt$<salt>$<hash>` format. */
  legacy: boolean;
}

/**
 * Hash format:
 * - current: `scrypt$<N>$<r>$<p>$<salt>$<hash>`
 * - legacy:  `scrypt$<salt>$<hash>` (Node default parameters)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

export function parseStoredHash(storedHash: string): ScryptHash | null {
  const parts = storedHash.split('$');
  if (parts[0] !== 'scrypt') return null;
  if (parts.length === 3) {
    const [, salt, hash] = parts;
    if (!salt || !hash) return null;
    return { ...LEGACY_SCRYPT_PARAMS, salt, hash, legacy: true };
  }
  if (parts.length === 6) {
    const [, n, r, p, salt, hash] = parts;
    const parsed = { N: Number(n), r: Number(r), p: Number(p) };
    if (![parsed.N, parsed.r, parsed.p].every((value) => Number.isInteger(value) && value > 0)) return null;
    if (!salt || !hash) return null;
    return { ...parsed, salt, hash, legacy: false };
  }
  return null;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  const candidate = scryptSync(password, parsed.salt, KEY_LENGTH, { N: parsed.N, r: parsed.r, p: parsed.p }).toString('hex');
  if (candidate.length !== parsed.hash.length) return false;
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(parsed.hash, 'hex'));
}

/**
 * True when the stored hash is in the legacy format or uses parameters
 * different from the current ones; it should be upgraded after a successful
 * verify so every login migrates hashes to the explicit format.
 */
export function needsRehash(storedHash: string): boolean {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  return parsed.legacy
    || parsed.N !== SCRYPT_PARAMS.N
    || parsed.r !== SCRYPT_PARAMS.r
    || parsed.p !== SCRYPT_PARAMS.p;
}
