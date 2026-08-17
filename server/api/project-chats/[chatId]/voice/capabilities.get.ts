import { getRouterParam } from 'h3';
import { authorizeProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';
import { voiceCapabilities } from '../../../../lib/voice-agent';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  authorizeProjectChat(chatId, user);
  return voiceCapabilities();
});
