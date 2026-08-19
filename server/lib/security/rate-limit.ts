/**
 * In-memory sliding-window rate limiter for authentication endpoints.
 *
 * Single-process only: state resets on restart, which is acceptable for
 * brute-force throttling (an attacker simply receives a fresh budget).
 */
import { getHeader, type H3Event } from 'h3';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface RateLimitBucket {
  hits: number[];
}

const buckets = new Map<string, RateLimitBucket>();
const MAX_TRACKED_KEYS = 20_000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const LOGIN_WINDOW_MS = readPositiveIntEnv('KANBAN_LOGIN_WINDOW_MS', 60_000);
export const LOGIN_IP_MAX_ATTEMPTS = readPositiveIntEnv('KANBAN_LOGIN_IP_MAX_ATTEMPTS', 30);
export const LOGIN_ACCOUNT_MAX_ATTEMPTS = readPositiveIntEnv('KANBAN_LOGIN_ACCOUNT_MAX_ATTEMPTS', 10);

function pruneBucket(bucket: RateLimitBucket, nowMs: number, windowMs: number): number {
  bucket.hits = bucket.hits.filter((hit) => nowMs - hit < windowMs);
  return bucket.hits.length;
}

function pruneAll(nowMs: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    if (pruneBucket(bucket, nowMs, windowMs) === 0) buckets.delete(key);
  }
}

function ensureSweep(windowMs: number) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => pruneAll(Date.now(), windowMs), SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitDecision {
  const nowMs = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) pruneAll(nowMs, windowMs);
  ensureSweep(windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  pruneBucket(bucket, nowMs, windowMs);
  if (bucket.hits.length >= maxAttempts) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0]!;
    return { allowed: false, retryAfterMs: Math.max(1_000, oldest + windowMs - nowMs) };
  }
  bucket.hits.push(nowMs);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Best-effort client IP. Uses the first X-Forwarded-For entry when the
 * service sits behind a reverse proxy; otherwise the socket address.
 */
export function clientIpKey(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-for');
  const forwardedIp = forwarded?.split(',')[0]!.trim();
  const ip = forwardedIp || event.node.req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/** Key that scopes attempts to one account as seen from one client IP. */
export function accountIpKey(event: H3Event, email: string): string {
  return `${clientIpKey(event)}|${email.trim().toLowerCase()}`;
}
