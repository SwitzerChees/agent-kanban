import { getRouterParam } from 'h3';
import { listProjectChats } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  return { chats: listProjectChats(projectId, user) };
});
