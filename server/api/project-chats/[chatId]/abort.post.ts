import { getRouterParam } from 'h3';
import { projectChatRuntime } from '../../../lib/project-chat-runtime';
import { requireSessionUser } from '../../../lib/security/auth';

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  return projectChatRuntime().abort(getRouterParam(event, 'chatId')!, user);
});
