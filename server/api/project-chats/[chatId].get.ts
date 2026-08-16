import { getRouterParam } from 'h3';
import { getProjectChat } from '../../lib/project-chat';
import { requireSessionUser } from '../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  return getProjectChat(getRouterParam(event, 'chatId')!, user);
});
