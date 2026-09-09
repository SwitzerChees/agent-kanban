import { createError, defineEventHandler, getHeader, getRequestURL, type H3Event, setHeader } from 'h3';
import { ZodError } from 'zod';
import { checkRateLimit, clientIpKey } from './security/rate-limit';
export function showroomHandler<T>(handler: (event: H3Event) => T) {
  return defineEventHandler(async event => {
    try { return await handler(event); }
    catch (error) {
      if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: 'showroom_invalid_input', data: { fields: error.issues.map(issue => issue.path.join('.')) } });
      throw error;
    }
  });
}
export function showroomRequest(event: H3Event, write = false) {
  setHeader(event, 'cache-control', 'no-store, private');
  setHeader(event, 'referrer-policy', 'no-referrer');
  const origin = getHeader(event, 'origin');
  if (write && origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'showroom_origin_forbidden' });
  if (!checkRateLimit(`showroom:${write ? 'write' : 'read'}:${clientIpKey(event)}`, write ? 40 : 180, 60_000).allowed) {
    setHeader(event, 'retry-after', 60);
    throw createError({ statusCode: 429, statusMessage: 'showroom_rate_limited' });
  }
}
export async function showroomBody(event: H3Event) {
  showroomRequest(event, true);
  // Enforce the actual stream length, including requests without Content-Length.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of event.node.req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > 128 * 1024) throw createError({ statusCode: 413, statusMessage: 'showroom_request_too_large' });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw createError({ statusCode: 400, statusMessage: 'showroom_invalid_json' }); }
}
