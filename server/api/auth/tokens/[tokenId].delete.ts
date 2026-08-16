import { getRouterParam } from 'h3';
import { requireSessionUser, revokeApiToken } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  return revokeApiToken(user.id, getRouterParam(event, 'tokenId')!);
});
