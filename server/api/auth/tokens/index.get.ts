import { listApiTokens, requireSessionUser } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  return { tokens: listApiTokens(user.id) };
});
