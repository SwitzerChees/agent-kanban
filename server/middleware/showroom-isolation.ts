import { createError, getHeader } from 'h3';
export default defineEventHandler(event => {
  // Opaque sandbox documents have Origin: null. They must never call privileged APIs,
  // even if a prototype tries to submit a forged request using ambient cookies.
  if (getHeader(event, 'origin') === 'null' && !event.path.startsWith('/showroom-preview/')) {
    throw createError({ statusCode: 403, statusMessage: 'sandbox_origin_forbidden' });
  }
});
