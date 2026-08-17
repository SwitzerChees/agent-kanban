import { getRouterParam, readBody, sendStream, setHeader } from 'h3';
import { z } from 'zod';
import { authorizeProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';
import { streamVoiceSpeech } from '../../../../lib/voice-agent';

const schema = z.object({
  text: z.string().min(1).max(1_200),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  authorizeProjectChat(chatId, user);
  const body = schema.parse(await readBody(event));
  const response = await streamVoiceSpeech(body.text, user.id);
  setHeader(event, 'content-type', response.headers.get('content-type') || 'audio/pcm');
  setHeader(event, 'cache-control', 'no-store');
  setHeader(event, 'x-audio-sample-rate', '24000');
  setHeader(event, 'x-content-type-options', 'nosniff');
  return sendStream(event, response.body!);
});
