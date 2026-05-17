import { getCurrentUser, toPublicUser } from '../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = getCurrentUser(event);
  return { user: user ? toPublicUser(user) : null };
});
