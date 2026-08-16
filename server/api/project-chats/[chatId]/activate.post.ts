import { getRouterParam } from 'h3';
import { activateProjectChat } from '../../../lib/project-chat';
import { requireSessionUser } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  return activateProjectChat(getRouterParam(event, 'chatId')!, user);
});
