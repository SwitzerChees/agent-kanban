import { clearSession } from '../../lib/security/auth';

export default defineEventHandler((event) => {
  clearSession(event);
  return { ok: true };
});
