import { getHeader, getRouterParam, readMultipartFormData } from 'h3';
import { z } from 'zod';
import { authorizeProjectChat } from '../../../../lib/project-chat';
import { requireSessionUser } from '../../../../lib/security/auth';
import { processVoiceTranscript, transcribeVoiceAudio } from '../../../../lib/voice-agent';

const fieldsSchema = z.object({
  locale: z.enum(['en', 'de']).default('de'),
  echoReference: z.string().max(1_200).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  authorizeProjectChat(chatId, user);
  const contentLength = Number.parseInt(getHeader(event, 'content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024 + 16 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'voice_audio_too_large' });
  }
  const parts = await readMultipartFormData(event);
  const audio = parts?.find((part) => part.name === 'audio' && part.data);
  if (!audio?.data) {
    throw createError({ statusCode: 400, statusMessage: 'voice_audio_missing' });
  }
  const fields = fieldsSchema.parse({
    locale: partText(parts, 'locale') || 'de',
    echoReference: partText(parts, 'echoReference') || undefined,
  });
  const transcript = await transcribeVoiceAudio(
    Buffer.from(audio.data),
    audio.type || 'audio/wav',
    user.id,
  );
  return processVoiceTranscript({
    threadId: chatId,
    transcript,
    locale: fields.locale,
    echoReference: fields.echoReference,
    user,
  });
});

function partText(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  const part = parts?.find((candidate) => candidate.name === name && !candidate.filename);
  return part?.data ? Buffer.from(part.data).toString('utf8') : '';
}
