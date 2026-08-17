import { getRouterParam } from 'h3';
import { requireSessionUser } from '../../../../lib/security/auth';
import { getVoiceStatus } from '../../../../lib/voice-agent';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  return getVoiceStatus(chatId, user);
});
