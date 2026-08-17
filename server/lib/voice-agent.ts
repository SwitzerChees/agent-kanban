import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { createError } from 'h3';
import { z } from 'zod';
import { appDataDir, db, schema } from './db';
import type { User } from './db/schema';
import {
  addTaskMessage,
  cancelTaskAgent,
  createTask,
} from './kanban';
import {
  appendProjectChatEvent,
  authorizeProjectChat,
  listChatMessages,
} from './project-chat';
import { projectChatRuntime } from './project-chat-runtime';

const DEFAULT_WHISPER_URL = 'https://vllm-whisper.hackerman.ch';
const DEFAULT_QWEN_URL = 'https://qwen-3-8-27b.lab.p11l.ch';
const DEFAULT_HIGGS_URL = 'https://higgstts.lab.p11l.ch';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const QWEN_MODEL = 'Qwen/Qwen3.8-27B';
const HIGGS_MODEL = 'bosonai/higgs-tts-3-4b';
const DEFAULT_VOICE = 'jarvis_deutsch';
const MAX_TRANSCRIPT_LENGTH = 4_000;
const MAX_SPEECH_LENGTH = 1_200;
const PROGRESS_ANNOUNCEMENT_INTERVAL_MS = 30_000;

export type VoiceLocale = 'en' | 'de';
export type VoiceIntent = 'respond' | 'orchestrate' | 'create_task' | 'status' | 'steer' | 'cancel' | 'clarify' | 'confirm' | 'reject';

const voiceRouteSchema = z.object({
  intent: z.enum(['respond', 'orchestrate', 'create_task', 'status', 'steer', 'cancel', 'clarify', 'confirm', 'reject']),
  spokenResponse: z.string().max(MAX_SPEECH_LENGTH),
  instruction: z.string().max(8_000),
  taskTitle: z.string().max(180),
  targetTask: z.string().max(180),
  requiresConfirmation: z.boolean(),
  confirmationPrompt: z.string().max(MAX_SPEECH_LENGTH),
});

type VoiceRoute = z.infer<typeof voiceRouteSchema>;
type VoiceCommandKind = 'orchestrate' | 'delegate' | 'steer' | 'cancel';
type RoutedCommandIntent = 'orchestrate' | 'create_task' | 'steer' | 'cancel';
type VoiceJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface VoiceConfig {
  apiKey: string;
  whisperUrl: string;
  qwenUrl: string;
  higgsUrl: string;
  voice: string;
}

interface ProcessVoiceTranscriptInput {
  threadId: string;
  transcript: string;
  locale: VoiceLocale;
  echoReference?: string;
  user: User;
}

const rateWindows = new Map<string, number[]>();

export function voiceCapabilities() {
  const config = resolveVoiceConfig(false);
  return {
    available: Boolean(config),
    transport: 'audio-worklet-http-sse' as const,
    continuousListening: true,
    bargeIn: true,
    storesRawAudio: false,
    models: config
      ? { whisper: WHISPER_MODEL, router: QWEN_MODEL, speech: HIGGS_MODEL, voice: config.voice }
      : null,
  };
}

export async function transcribeVoiceAudio(audio: Buffer, mimeType: string, userId: string) {
  enforceVoiceRateLimit(userId, 'transcribe', 24, 60_000);
  if (!audio.length) throw createError({ statusCode: 400, statusMessage: 'voice_audio_empty' });
  if (audio.length > 10 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'voice_audio_too_large' });
  }
  if (!mimeType.startsWith('audio/')) {
    throw createError({ statusCode: 400, statusMessage: 'voice_audio_type_invalid' });
  }

  const config = resolveVoiceConfig();
  const form = new FormData();
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  form.append('model', WHISPER_MODEL);
  form.append('language', 'de');
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `voice-turn.${extension}`);
  const response = await modelFetch(`${config.whisperUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: form,
  }, 45_000);
  const payload = await response.json().catch(() => null) as { text?: unknown } | null;
  const transcript = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!transcript) throw createError({ statusCode: 422, statusMessage: 'voice_transcript_empty' });
  return transcript.slice(0, MAX_TRANSCRIPT_LENGTH);
}

export async function streamVoiceSpeech(text: string, userId: string) {
  enforceVoiceRateLimit(userId, 'speech', 36, 60_000);
  const input = text.trim().slice(0, MAX_SPEECH_LENGTH);
  if (!input) throw createError({ statusCode: 400, statusMessage: 'voice_speech_empty' });
  const config = resolveVoiceConfig();
  const response = await modelFetch(`${config.higgsUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HIGGS_MODEL,
      input,
      voice: config.voice,
      response_format: 'pcm',
      stream: true,
    }),
  }, 60_000);
  if (!response.body) throw createError({ statusCode: 502, statusMessage: 'voice_speech_unavailable' });
  return response;
}

export async function processVoiceTranscript(input: ProcessVoiceTranscriptInput) {
  const thread = authorizeProjectChat(input.threadId, input.user);
  enforceVoiceRateLimit(input.user.id, 'turn', 20, 60_000);
  const transcript = input.transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
  if (!transcript) throw createError({ statusCode: 400, statusMessage: 'voice_transcript_empty' });
  if (input.echoReference && isLikelyPlaybackEcho(transcript, input.echoReference)) {
    return { ignored: true, reason: 'playback_echo', transcript };
  }

  const context = voiceContext(input.threadId);
  const pending = context.pendingCommand;
  const routed = await routeVoiceTranscript({
    transcript,
    locale: input.locale,
    thread,
    messages: listChatMessages(input.threadId).slice(-10),
    jobs: context.jobs,
    pending,
  });
  const route: VoiceRoute = routed.intent === 'create_task' && !explicitTaskCreationRequested(transcript)
    ? { ...routed, intent: 'orchestrate' }
    : routed;

  let spokenResponse = route.spokenResponse.trim();
  let job: ReturnType<typeof publicVoiceJob> | null = null;
  let action: VoiceIntent = route.intent;

  try {
    if (pending) {
      if (route.intent === 'confirm') {
        const dispatched = await dispatchStoredCommand(pending, thread, input.user, input.locale);
        spokenResponse = dispatched.spokenResponse;
        job = dispatched.job;
        action = pending.kind === 'delegate' ? 'create_task' : pending.kind;
      } else if (route.intent === 'reject') {
        updateVoiceCommand(pending.id, { status: 'rejected' });
        spokenResponse = input.locale === 'de'
          ? 'Alles klar, ich führe diese Aktion nicht aus.'
          : 'Understood. I will not perform that action.';
      } else {
        spokenResponse = input.locale === 'de'
          ? 'Bitte bestätige oder verwerfe zuerst die noch offene Aktion.'
          : 'Please confirm or reject the pending action first.';
        action = 'clarify';
      }
    } else if (route.intent === 'status') {
      spokenResponse = describeVoiceJobs(context.jobs, input.locale);
    } else if (isCommandIntent(route.intent)) {
      const kind: VoiceCommandKind = route.intent === 'create_task' ? 'delegate' : route.intent;
      const chatRunning = projectChatRuntime().isRunning(thread.id);
      const targetTaskId = kind === 'delegate' || kind === 'orchestrate' || (chatRunning && !route.targetTask.trim())
        ? null
        : resolveTargetTaskId(context.taskJobs, route.targetTask);
      const confirmationText = route.confirmationPrompt.trim() || route.spokenResponse.trim();
      if (kind !== 'delegate' && kind !== 'orchestrate' && !targetTaskId && !chatRunning) {
        spokenResponse = input.locale === 'de'
          ? 'Welche Hintergrundaufgabe meinst du? Bitte nenne den Aufgaben-Key oder den Titel.'
          : 'Which background task do you mean? Please say its task key or title.';
        action = 'clarify';
      } else if (route.requiresConfirmation) {
        insertVoiceCommand({
          threadId: input.threadId,
          userId: input.user.id,
          kind,
          status: 'pending_confirmation',
          transcript,
          instruction: route.instruction,
          taskTitle: route.taskTitle,
          targetTaskId,
          spokenResponse: confirmationText,
        });
        spokenResponse = confirmationText || (input.locale === 'de'
          ? 'Diese Aktion braucht deine ausdrückliche Bestätigung.'
          : 'This action needs your explicit confirmation.');
      } else {
        const command = insertVoiceCommand({
          threadId: input.threadId,
          userId: input.user.id,
          kind,
          status: 'dispatched',
          transcript,
          instruction: route.instruction,
          taskTitle: route.taskTitle,
          targetTaskId,
          spokenResponse: route.spokenResponse,
        });
        const dispatched = await dispatchStoredCommand(command, thread, input.user, input.locale);
        spokenResponse = dispatched.spokenResponse || spokenResponse;
        job = dispatched.job;
      }
    }
  } catch (error) {
    spokenResponse = input.locale === 'de'
      ? 'Das konnte ich nicht an den Hintergrund-Agenten übergeben. Bitte versuche es noch einmal.'
      : 'I could not hand that to the background agent. Please try again.';
    action = 'clarify';
    appendProjectChatEvent(input.threadId, 'voice_error', { code: publicVoiceError(error) });
  }

  spokenResponse = spokenResponse.slice(0, MAX_SPEECH_LENGTH);
  const chatOwnsConversation = Boolean(job && !job.taskId && (action === 'orchestrate' || action === 'steer'));
  if (!chatOwnsConversation) persistVoiceConversation(input.threadId, transcript, spokenResponse);
  return {
    ignored: false,
    transcript,
    spokenResponse,
    intent: action,
    job,
    pendingConfirmation: Boolean(!pending && isCommandIntent(route.intent) && route.requiresConfirmation),
  };
}

export function getVoiceStatus(threadId: string, user: User) {
  authorizeProjectChat(threadId, user);
  const context = voiceContext(threadId);
  return {
    capabilities: voiceCapabilities(),
    jobs: context.jobs,
    pendingConfirmation: context.pendingCommand
      ? {
          id: context.pendingCommand.id,
          kind: context.pendingCommand.kind,
          prompt: context.pendingCommand.spokenResponse,
          createdAt: context.pendingCommand.createdAt,
        }
      : null,
  };
}

export function notifyVoiceJobStatus(taskId: string, status: VoiceJobStatus, detail?: string) {
  const row = voiceJobRow(taskId);
  if (!row) return false;
  const now = new Date().toISOString();
  db.update(schema.projectChatVoiceJobs).set({ status, updatedAt: now })
    .where(eq(schema.projectChatVoiceJobs.id, row.job.id)).run();
  appendProjectChatEvent(row.job.threadId, 'voice_job_update', {
    jobId: row.job.id,
    taskId: row.task.id,
    taskKey: row.task.key,
    title: row.task.title,
    harness: row.task.agentHarness,
    status,
    detail: detail?.slice(0, 240) || null,
    announce: status !== 'queued',
  });
  return true;
}

export function notifyVoiceJobProgress(taskId: string, body: string) {
  const row = voiceJobRow(taskId);
  if (!row || row.job.status !== 'running') return false;
  const previous = row.job.lastProgressAt ? Date.parse(row.job.lastProgressAt) : 0;
  if (Number.isFinite(previous) && Date.now() - previous < PROGRESS_ANNOUNCEMENT_INTERVAL_MS) return false;
  const progress = conciseProgress(body);
  if (!progress) return false;
  const now = new Date().toISOString();
  db.update(schema.projectChatVoiceJobs).set({
    latestProgress: progress,
    lastProgressAt: now,
    updatedAt: now,
  }).where(eq(schema.projectChatVoiceJobs.id, row.job.id)).run();
  appendProjectChatEvent(row.job.threadId, 'voice_job_progress', {
    jobId: row.job.id,
    taskId: row.task.id,
    taskKey: row.task.key,
    title: row.task.title,
    status: 'running',
    detail: progress,
    announce: true,
  });
  return true;
}

export function parseVoiceRouteContent(content: unknown) {
  if (typeof content !== 'string') throw new Error('voice_route_empty');
  return voiceRouteSchema.parse(JSON.parse(content));
}

export function isLikelyPlaybackEcho(transcript: string, playback: string) {
  const heard = normalizedWords(transcript);
  const spoken = normalizedWords(playback);
  if (heard.length < 2 || spoken.length < 2) return false;
  const spokenSet = new Set(spoken);
  const overlap = heard.filter((word) => spokenSet.has(word)).length;
  const containment = overlap / Math.min(heard.length, spoken.length);
  const lengthRatio = Math.min(heard.length, spoken.length) / Math.max(heard.length, spoken.length);
  if (Math.min(heard.length, spoken.length) === 2) return containment === 1 && lengthRatio >= 0.8;
  return containment >= 0.78 && lengthRatio >= 0.55;
}

function voiceContext(threadId: string) {
  const thread = db.select({
    harness: schema.projectChatThreads.harness,
    reasoningEffort: schema.projectChatThreads.reasoningEffort,
  }).from(schema.projectChatThreads).where(eq(schema.projectChatThreads.id, threadId)).get();
  const taskJobs = db.select({ job: schema.projectChatVoiceJobs, task: schema.tasks })
    .from(schema.projectChatVoiceJobs)
    .innerJoin(schema.tasks, eq(schema.projectChatVoiceJobs.taskId, schema.tasks.id))
    .where(eq(schema.projectChatVoiceJobs.threadId, threadId))
    .orderBy(desc(schema.projectChatVoiceJobs.createdAt))
    .limit(12)
    .all()
    .map((row) => publicVoiceJob(row.job, row.task));
  const orchestratorJobs = db.select().from(schema.projectChatVoiceCommands)
    .where(eq(schema.projectChatVoiceCommands.threadId, threadId))
    .orderBy(desc(schema.projectChatVoiceCommands.createdAt))
    .limit(20)
    .all()
    .filter((command) => command.kind === 'orchestrate' || (command.kind === 'steer' && !command.targetTaskId))
    .map((command) => publicOrchestratorJob(
      command,
      thread?.harness ?? 'codex',
      thread?.reasoningEffort ?? 'xhigh',
    ));
  const jobs = [...taskJobs, ...orchestratorJobs]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);
  const pendingCommand = db.select().from(schema.projectChatVoiceCommands)
    .where(and(
      eq(schema.projectChatVoiceCommands.threadId, threadId),
      eq(schema.projectChatVoiceCommands.status, 'pending_confirmation'),
    ))
    .orderBy(desc(schema.projectChatVoiceCommands.createdAt))
    .get() ?? null;
  return { jobs, taskJobs, pendingCommand };
}

async function routeVoiceTranscript(input: {
  transcript: string;
  locale: VoiceLocale;
  thread: typeof schema.projectChatThreads.$inferSelect;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  jobs: Array<ReturnType<typeof publicVoiceJob>>;
  pending: typeof schema.projectChatVoiceCommands.$inferSelect | null;
}) {
  const config = resolveVoiceConfig();
  const language = input.locale === 'de' ? 'German' : 'English';
  const project = db.select({ key: schema.projects.key, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.thread.projectId))
    .get();
  const history = input.messages.map((message) => ({
    role: message.role,
    content: message.content.slice(-2_000),
  }));
  const system = [
    `You are Jarvis, the concise ${language} foreground dialog and action router inside Agent Kanban.`,
    'The foreground voice loop must stay conversational while a separate background agent works.',
    'Choose respond only for ordinary conversation that needs no project inspection or action.',
    'Choose orchestrate by default whenever the user asks you to inspect, find, check, analyse, run, fix, implement, change, or otherwise do something in the current project. Orchestrate uses the private chat background harness and must not create a Kanban item.',
    'Choose create_task only when the user explicitly asks to create/add/open a Kanban task, card, ticket, issue, or board item. Merely asking to do work is never create_task.',
    'Choose status only when the user asks what this voice assistant or its current background run is doing. Questions about open project tasks, assigned work, the board, or project state require orchestrate so the harness can inspect the real project data.',
    'Choose steer for additional information or changed instructions while background work is active, cancel to stop it, and clarify whenever anything important is ambiguous.',
    'If a pending command exists, choose confirm only for a clear affirmative answer and reject only for a clear refusal. Otherwise clarify.',
    'Always ask a short follow-up when the object, target task, scope, destination, or desired outcome is unclear.',
    'Set requiresConfirmation=true for destructive, irreversible, security-sensitive, credential-related, deployment, publication, purchase, external messaging, or other consequential external-state actions. Normal reversible work inside an isolated task worktree does not need confirmation.',
    'Do not choose clarify merely to request confirmation. For a clear consequential command, choose orchestrate, create_task, steer, or cancel and set requiresConfirmation=true so the application can persist and enforce the confirmation.',
    'Keep spokenResponse to one or two natural sentences. Never expose hidden reasoning, raw tool output, tokens, credentials, or implementation protocol.',
    `The selected background harness is ${input.thread.harness} with ${input.thread.reasoningEffort} effort. Do not select another harness.`,
    `The current private project chat belongs to ${project ? `${project.name} (${project.key})` : input.thread.projectId}. Treat every unqualified or deictic project reference, including "this project", "dieses Projekt", "das Projekt", and "das Testprojekt", as this current project; do not ask which project unless the user clearly names another one.`,
    `Current voice jobs: ${JSON.stringify(input.jobs.map((job) => ({ id: job.id, taskId: job.taskId, key: job.taskKey, title: job.title, status: job.status, progress: job.latestProgress })))}.`,
    `Pending command: ${input.pending ? JSON.stringify({ kind: input.pending.kind, instruction: input.pending.instruction, prompt: input.pending.spokenResponse }) : 'none'}.`,
  ].join('\n');
  const response = await modelFetch(`${config.qwenUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      temperature: 0,
      max_tokens: 360,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: input.transcript },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'voice_route',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              intent: { type: 'string', enum: ['respond', 'orchestrate', 'create_task', 'status', 'steer', 'cancel', 'clarify', 'confirm', 'reject'] },
              spokenResponse: { type: 'string' },
              instruction: { type: 'string' },
              taskTitle: { type: 'string' },
              targetTask: { type: 'string' },
              requiresConfirmation: { type: 'boolean' },
              confirmationPrompt: { type: 'string' },
            },
            required: ['intent', 'spokenResponse', 'instruction', 'taskTitle', 'targetTask', 'requiresConfirmation', 'confirmationPrompt'],
            additionalProperties: false,
          },
        },
      },
    }),
  }, 30_000);
  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  try {
    return parseVoiceRouteContent(payload?.choices?.[0]?.message?.content);
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'voice_router_invalid' });
  }
}

async function dispatchStoredCommand(
  command: typeof schema.projectChatVoiceCommands.$inferSelect,
  thread: typeof schema.projectChatThreads.$inferSelect,
  user: User,
  locale: VoiceLocale,
) {
  try {
    if (command.kind === 'orchestrate') {
      const instruction = command.instruction.trim() || command.transcript.trim();
      if (projectChatRuntime().isRunning(thread.id)) {
        projectChatRuntime().queueFollowUp(
          thread.id,
          instruction,
          command.transcript,
          `voice-orchestrator-follow-up-${command.id}`,
          command.id,
          user,
        );
        const spokenResponse = locale === 'de'
          ? 'Ich habe die zusätzliche Anweisung aufgenommen. Der Hintergrund-Agent übernimmt sie am nächsten sicheren Übergabepunkt.'
          : 'I captured the additional instruction. The background agent will pick it up at the next safe handoff point.';
        updateVoiceCommand(command.id, { status: 'queued', spokenResponse });
        return { spokenResponse, job: publicOrchestratorJob(
          { ...command, status: 'queued', spokenResponse },
          thread.harness,
          thread.reasoningEffort,
        ) };
      }
      projectChatRuntime().queueMessage(thread.id, instruction, `voice-orchestrator-${command.id}`, user, {
        mode: 'orchestrator',
        displayContent: command.transcript,
        voiceCommandId: command.id,
      });
      const spokenResponse = locale === 'de'
        ? `Verstanden. Ich lasse ${harnessLabel(thread.harness)} das direkt im Projektchat prüfen und bleibe für weitere Hinweise erreichbar.`
        : `Understood. I’ll have ${harnessLabel(thread.harness)} handle that directly in the project chat and keep listening for updates.`;
      updateVoiceCommand(command.id, { status: 'dispatched', spokenResponse });
      return { spokenResponse, job: publicOrchestratorJob(
        { ...command, status: 'dispatched', spokenResponse },
        thread.harness,
        thread.reasoningEffort,
      ) };
    }

    if (command.kind === 'delegate') {
      const todo = db.select().from(schema.columns)
        .where(and(eq(schema.columns.projectId, thread.projectId), eq(schema.columns.key, 'todo')))
        .get();
      if (!todo) throw createError({ statusCode: 409, statusMessage: 'missing_todo_column' });
      const title = command.taskTitle.trim() || fallbackTaskTitle(command.instruction || command.transcript);
      const task = await createTask(thread.projectId, {
        title,
        description: command.instruction.trim() || command.transcript.trim(),
        columnId: todo.id,
        agentEnabled: true,
        agentHarness: thread.harness,
        reasoningEffort: thread.reasoningEffort,
        clientRequestId: `voice-${command.id}`,
        tags: ['voice'],
      }, user);
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        threadId: thread.id,
        taskId: task.id,
        commandId: command.id,
        status: 'queued' as const,
        instruction: command.instruction.trim() || command.transcript.trim(),
        latestProgress: null,
        lastProgressAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(schema.projectChatVoiceJobs).values(job).run();
      const spokenResponse = locale === 'de'
        ? `Verstanden. Ich habe ${task.key} an ${harnessLabel(thread.harness)} übergeben und bleibe für weitere Hinweise erreichbar.`
        : `Understood. I handed ${task.key} to ${harnessLabel(thread.harness)} and will keep listening for more input.`;
      updateVoiceCommand(command.id, { status: 'dispatched', targetTaskId: task.id, spokenResponse });
      appendProjectChatEvent(thread.id, 'voice_job_update', {
        jobId: job.id,
        taskId: task.id,
        taskKey: task.key,
        title: task.title,
        harness: task.agentHarness,
        status: 'queued',
        announce: false,
      });
      return { spokenResponse, job: publicVoiceJob(job, task) };
    }

    const context = voiceContext(thread.id);
    const taskId = command.targetTaskId ?? resolveTargetTaskId(context.taskJobs, '');
    const target = taskId ? context.taskJobs.find((job) => job.taskId === taskId) : null;
    if (command.kind === 'steer') {
      if (!taskId && projectChatRuntime().isRunning(thread.id)) {
        const instruction = command.instruction.trim() || command.transcript.trim();
        projectChatRuntime().queueFollowUp(
          thread.id,
          instruction,
          command.transcript,
          `voice-steer-${command.id}`,
          command.id,
          user,
        );
        const spokenResponse = locale === 'de'
          ? 'Ich habe den Hinweis aufgenommen. Der Hintergrund-Agent übernimmt ihn am nächsten sicheren Übergabepunkt.'
          : 'I captured that update. The background agent will pick it up at the next safe handoff point.';
        updateVoiceCommand(command.id, { status: 'queued', spokenResponse });
        return { spokenResponse, job: publicOrchestratorJob(
          { ...command, status: 'queued', spokenResponse },
          thread.harness,
          thread.reasoningEffort,
        ) };
      }
      if (!taskId) throw createError({ statusCode: 409, statusMessage: 'voice_target_task_ambiguous' });
      addTaskMessage(taskId, command.instruction.trim() || command.transcript.trim(), user);
      const spokenResponse = locale === 'de'
        ? `Ich habe den Hinweis an ${target?.taskKey ?? 'die Hintergrundaufgabe'} weitergegeben.`
        : `I passed that update to ${target?.taskKey ?? 'the background task'}.`;
      updateVoiceCommand(command.id, { status: 'dispatched', targetTaskId: taskId, spokenResponse });
      appendProjectChatEvent(thread.id, 'voice_job_update', {
        jobId: target?.id ?? null,
        taskId,
        taskKey: target?.taskKey ?? null,
        title: target?.title ?? null,
        status: target?.status ?? 'running',
        detail: command.instruction.trim() || command.transcript.trim(),
        announce: false,
      });
      return { spokenResponse, job: target ?? null };
    }

    if (!taskId && projectChatRuntime().isRunning(thread.id)) {
      await projectChatRuntime().abort(thread.id, user);
      const spokenResponse = locale === 'de'
        ? 'Ich habe die Hintergrundarbeit im Projektchat gestoppt.'
        : 'I stopped the background work in the project chat.';
      updateVoiceCommand(command.id, { status: 'completed', spokenResponse });
      return { spokenResponse, job: null };
    }
    if (!taskId) throw createError({ statusCode: 409, statusMessage: 'voice_target_task_ambiguous' });
    cancelTaskAgent(taskId, user);
    const { abortLocalTask } = await import('./local-dispatcher');
    abortLocalTask(taskId);
    db.update(schema.projectChatVoiceJobs).set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(schema.projectChatVoiceJobs.taskId, taskId)).run();
    const spokenResponse = locale === 'de'
      ? `Ich habe ${target?.taskKey ?? 'die Hintergrundaufgabe'} gestoppt.`
      : `I stopped ${target?.taskKey ?? 'the background task'}.`;
    updateVoiceCommand(command.id, { status: 'dispatched', targetTaskId: taskId, spokenResponse });
    appendProjectChatEvent(thread.id, 'voice_job_update', {
      jobId: target?.id ?? null,
      taskId,
      taskKey: target?.taskKey ?? null,
      title: target?.title ?? null,
      status: 'cancelled',
      announce: false,
    });
    return { spokenResponse, job: target ? { ...target, status: 'cancelled' as const } : null };
  } catch (error) {
    updateVoiceCommand(command.id, { status: 'failed' });
    throw error;
  }
}

function insertVoiceCommand(input: {
  threadId: string;
  userId: string;
  kind: VoiceCommandKind;
  status: 'pending_confirmation' | 'queued' | 'dispatched';
  transcript: string;
  instruction: string;
  taskTitle: string;
  targetTaskId: string | null;
  spokenResponse: string;
}) {
  const now = new Date().toISOString();
  const command = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
  db.insert(schema.projectChatVoiceCommands).values(command).run();
  return command;
}

function updateVoiceCommand(
  commandId: string,
  values: Partial<Pick<typeof schema.projectChatVoiceCommands.$inferInsert, 'status' | 'targetTaskId' | 'spokenResponse'>>,
) {
  db.update(schema.projectChatVoiceCommands).set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(schema.projectChatVoiceCommands.id, commandId)).run();
}

function persistVoiceConversation(threadId: string, transcript: string, spokenResponse: string) {
  const now = Date.now();
  const userCreatedAt = new Date(now).toISOString();
  const assistantCreatedAt = new Date(now + 1).toISOString();
  const userMessageId = randomUUID();
  const assistantMessageId = randomUUID();
  const thread = db.select().from(schema.projectChatThreads).where(eq(schema.projectChatThreads.id, threadId)).get();
  db.transaction((tx) => {
    tx.insert(schema.projectChatMessages).values([
      {
        id: userMessageId,
        threadId,
        role: 'user',
        content: transcript,
        state: 'complete',
        clientRequestId: null,
        createdAt: userCreatedAt,
        updatedAt: userCreatedAt,
      },
      {
        id: assistantMessageId,
        threadId,
        role: 'assistant',
        content: spokenResponse,
        state: 'complete',
        clientRequestId: null,
        createdAt: assistantCreatedAt,
        updatedAt: assistantCreatedAt,
      },
    ]).run();
    tx.update(schema.projectChatThreads).set({
      title: thread?.title || fallbackTaskTitle(transcript),
      updatedAt: assistantCreatedAt,
    }).where(eq(schema.projectChatThreads.id, threadId)).run();
    tx.insert(schema.projectChatEvents).values({
      threadId,
      type: 'voice_turn_completed',
      payload: JSON.stringify({ userMessageId, assistantMessageId, transcript, spokenResponse }),
      createdAt: assistantCreatedAt,
    }).run();
  });
}

function publicVoiceJob(
  job: typeof schema.projectChatVoiceJobs.$inferSelect,
  task?: Pick<typeof schema.tasks.$inferSelect, 'id' | 'key' | 'title' | 'agentHarness' | 'reasoningEffort' | 'agentStatus' | 'updatedAt'>,
) {
  return {
    id: job.id,
    taskId: job.taskId,
    taskKey: task?.key ?? '',
    title: task?.title ?? '',
    harness: task?.agentHarness ?? 'codex',
    reasoningEffort: task?.reasoningEffort ?? 'xhigh',
    status: normalizeJobStatus(task?.agentStatus, job.status),
    latestProgress: job.latestProgress,
    createdAt: job.createdAt,
    updatedAt: task?.updatedAt ?? job.updatedAt,
  };
}

function publicOrchestratorJob(
  command: typeof schema.projectChatVoiceCommands.$inferSelect,
  harness: typeof schema.projectChatThreads.$inferSelect.harness,
  reasoningEffort: typeof schema.projectChatThreads.$inferSelect.reasoningEffort,
) {
  const status: VoiceJobStatus = command.status === 'queued' || command.status === 'pending_confirmation'
    ? 'queued'
    : command.status === 'completed'
      ? 'done'
      : command.status === 'failed'
        ? 'failed'
        : command.status === 'cancelled' || command.status === 'rejected'
          ? 'cancelled'
          : 'running';
  return {
    id: command.id,
    taskId: '',
    taskKey: 'Projektchat',
    title: command.taskTitle || fallbackTaskTitle(command.instruction || command.transcript),
    harness,
    reasoningEffort,
    status,
    latestProgress: status === 'queued' && command.kind === 'steer'
      ? 'Zusätzlicher Hinweis wartet auf den nächsten sicheren Übergabepunkt.'
      : null,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
  };
}

function voiceJobRow(taskId: string) {
  return db.select({ job: schema.projectChatVoiceJobs, task: schema.tasks })
    .from(schema.projectChatVoiceJobs)
    .innerJoin(schema.tasks, eq(schema.projectChatVoiceJobs.taskId, schema.tasks.id))
    .where(eq(schema.projectChatVoiceJobs.taskId, taskId))
    .get() ?? null;
}

function normalizeJobStatus(agentStatus: string | undefined, stored: VoiceJobStatus): VoiceJobStatus {
  if (stored === 'cancelled') return stored;
  if (agentStatus === 'queued' || agentStatus === 'running' || agentStatus === 'done' || agentStatus === 'failed') return agentStatus;
  return stored;
}

function resolveTargetTaskId(jobs: Array<ReturnType<typeof publicVoiceJob>>, target: string) {
  const active = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const normalized = target.trim().toLowerCase();
  if (normalized) {
    const exact = jobs.find((job) => [job.id, job.taskId, job.taskKey, job.title]
      .some((value) => value.toLowerCase() === normalized));
    if (exact) return exact.taskId;
    const partial = jobs.filter((job) => `${job.taskKey} ${job.title}`.toLowerCase().includes(normalized));
    if (partial.length === 1) return partial[0]!.taskId;
  }
  return active.length === 1 ? active[0]!.taskId : null;
}

function describeVoiceJobs(jobs: Array<ReturnType<typeof publicVoiceJob>>, locale: VoiceLocale) {
  const active = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  if (!active.length) {
    const latest = jobs[0];
    if (!latest) return locale === 'de' ? 'Aktuell läuft keine Hintergrundaufgabe.' : 'No background task is currently running.';
    if (latest.status === 'done') {
      return locale === 'de' ? `${latest.taskKey} ist abgeschlossen und liegt zur Prüfung bereit.` : `${latest.taskKey} is complete and ready for review.`;
    }
    if (latest.status === 'failed') {
      return locale === 'de' ? `${latest.taskKey} konnte nicht abgeschlossen werden.` : `${latest.taskKey} could not be completed.`;
    }
    return locale === 'de' ? 'Aktuell läuft keine Hintergrundaufgabe.' : 'No background task is currently running.';
  }
  if (active.length > 1) {
    return locale === 'de'
      ? `${active.length} Hintergrundaufgaben sind aktiv: ${active.map((job) => job.taskKey).join(', ')}.`
      : `${active.length} background tasks are active: ${active.map((job) => job.taskKey).join(', ')}.`;
  }
  const job = active[0]!;
  const detail = job.latestProgress ? ` ${job.latestProgress}` : '';
  return locale === 'de'
    ? `${job.taskKey} ${job.status === 'queued' ? 'wartet auf einen freien Agent-Platz.' : 'wird gerade bearbeitet.'}${detail}`
    : `${job.taskKey} ${job.status === 'queued' ? 'is waiting for an available agent slot.' : 'is currently being worked on.'}${detail}`;
}

function isCommandIntent(intent: VoiceIntent): intent is RoutedCommandIntent {
  return intent === 'orchestrate' || intent === 'create_task' || intent === 'steer' || intent === 'cancel';
}

export function explicitTaskCreationRequested(value: string) {
  const normalized = value.toLocaleLowerCase('de-CH').replace(/[‐‑‒–—]/g, '-');
  const object = /\b(task|aufgabe|karte|card|ticket|issue|kanban(?:-task)?|board(?:-eintrag| item)?)\b/;
  const action = /\b(erstell(?:e|en|t)|anleg(?:e|en|t)|hinzuf(?:ü|ue)g(?:e|en|t)|create|add)\b/;
  const explicitNewItem = /\b(neu(?:e|en|er|es)?|new)\s+(?:kanban-)?(?:task|aufgabe|karte|card|ticket|issue)\b/;
  return (object.test(normalized) && action.test(normalized)) || explicitNewItem.test(normalized);
}

function conciseProgress(value: string) {
  const text = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length < 24 && !/[.!?]/.test(text)) return null;
  const first = text.match(/^(.{1,180}?[.!?])(?:\s|$)/)?.[1] ?? text.slice(0, 180);
  return first.trim();
}

function fallbackTaskTitle(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Voice task';
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  return firstSentence.slice(0, 96);
}

function harnessLabel(harness: string) {
  if (harness === 'prime-agent') return 'Prime Agent';
  if (harness === 'opencode') return 'OpenCode';
  return 'Codex';
}

function normalizedWords(value: string) {
  return value.toLocaleLowerCase('de-CH')
    .normalize('NFKD')
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function resolveVoiceConfig(required?: true): VoiceConfig;
function resolveVoiceConfig(required: false): VoiceConfig | null;
function resolveVoiceConfig(required = true): VoiceConfig | null {
  const apiKey = process.env.VOICE_MODEL_API_KEY?.trim() || readVoiceSecret();
  if (!apiKey) {
    if (required) throw createError({ statusCode: 503, statusMessage: 'voice_not_configured' });
    return null;
  }
  return {
    apiKey,
    whisperUrl: stripTrailingSlash(process.env.VOICE_WHISPER_URL || DEFAULT_WHISPER_URL),
    qwenUrl: stripTrailingSlash(process.env.VOICE_QWEN_URL || DEFAULT_QWEN_URL),
    higgsUrl: stripTrailingSlash(process.env.VOICE_HIGGS_URL || DEFAULT_HIGGS_URL),
    voice: process.env.VOICE_HIGGS_VOICE?.trim() || DEFAULT_VOICE,
  };
}

function readVoiceSecret() {
  const secretPath = process.env.VOICE_MODEL_API_KEY_FILE || appDataDir('secrets', 'vllm-api-key');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch {
    return '';
  }
}

async function modelFetch(url: string, init: RequestInit, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'voice_model_unavailable' });
  }
  if (!response.ok) {
    throw createError({ statusCode: 502, statusMessage: 'voice_model_unavailable' });
  }
  return response;
}

function enforceVoiceRateLimit(userId: string, bucket: string, limit: number, windowMs: number) {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const active = (rateWindows.get(key) ?? []).filter((value) => now - value < windowMs);
  if (active.length >= limit) {
    throw createError({ statusCode: 429, statusMessage: 'voice_rate_limited' });
  }
  active.push(now);
  rateWindows.set(key, active);
}

function publicVoiceError(error: unknown) {
  const candidate = error as { statusMessage?: unknown };
  return typeof candidate?.statusMessage === 'string' ? candidate.statusMessage : 'voice_background_failed';
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
