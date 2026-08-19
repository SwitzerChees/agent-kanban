import { createError, getHeader, getRouterParam, readFormData } from 'h3';
import { z } from 'zod';
import { formDataFiles, formDataText } from '../../../../lib/form-data';
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
  const formData = await readFormData(event);
  const audio = formDataFiles(formData, 'audio')[0];
  if (!audio) {
    throw createError({ statusCode: 400, statusMessage: 'voice_audio_missing' });
  }
  const fields = fieldsSchema.parse({
    locale: formDataText(formData, 'locale') || 'de',
    echoReference: formDataText(formData, 'echoReference') || undefined,
  });
  const transcript = await transcribeVoiceAudio(
    Buffer.from(await audio.arrayBuffer()),
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
