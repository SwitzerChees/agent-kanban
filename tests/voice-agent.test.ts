import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-voice-agent-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'voice-agent@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'voice-agent-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let chat: typeof import('../server/lib/project-chat');
let voice: typeof import('../server/lib/voice-agent');
let admin: User;
let chatId: string;
let taskId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  chat = await import('../server/lib/project-chat');
  voice = await import('../server/lib/voice-agent');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  const project = await kanban.createProject({
    name: 'Voice Project',
    key: 'VOICE',
    folderPath: path.join(testRoot, 'workspace'),
  }, admin);
  const thread = chat.createProjectChat(project.id, { harness: 'codex', reasoningEffort: 'medium' }, admin).chat;
  chatId = thread.id;
  const board = kanban.getBoard(project.id, admin);
  const todo = board.columns.find((column) => column.key === 'todo')!;
  const task = await kanban.createTask(project.id, {
    title: 'Test the voice bridge',
    description: 'Run a safe background task.',
    columnId: todo.id,
    agentEnabled: true,
    agentHarness: 'codex',
    reasoningEffort: 'medium',
  }, admin);
  taskId = task.id;
  const now = new Date().toISOString();
  dbModule.db.insert(dbModule.schema.projectChatVoiceJobs).values({
    id: randomUUID(),
    threadId: chatId,
    taskId,
    commandId: null,
    status: 'queued',
    instruction: 'Run a safe background task.',
    latestProgress: null,
    lastProgressAt: null,
    createdAt: now,
    updatedAt: now,
  }).run();
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('live voice agent bridge', () => {
  test('validates the strict Qwen routing contract', () => {
    expect(voice.parseVoiceRouteContent(JSON.stringify({
      intent: 'create_task',
      spokenResponse: 'Ich übernehme das.',
      instruction: 'Führe die Tests aus.',
      taskTitle: 'Tests ausführen',
      targetTask: '',
      requiresConfirmation: false,
      confirmationPrompt: '',
    }))).toMatchObject({ intent: 'create_task', taskTitle: 'Tests ausführen' });

    expect(() => voice.parseVoiceRouteContent(JSON.stringify({
      intent: 'orchestrate',
      spokenResponse: 'Ich übernehme das.',
    }))).toThrow();
  });

  test('requires explicit Kanban language before creating a visible task', () => {
    expect(voice.explicitTaskCreationRequested('Prüfe im Projekt, welche Aufgaben Patrick noch offen hat.')).toBe(false);
    expect(voice.explicitTaskCreationRequested('Implementiere den Fix bitte direkt.')).toBe(false);
    expect(voice.explicitTaskCreationRequested('Mach die Aufgabe bitte fertig.')).toBe(false);
    expect(voice.explicitTaskCreationRequested('Erstelle dafür einen Kanban-Task.')).toBe(true);
    expect(voice.explicitTaskCreationRequested('Neuer Task: Browser-Test ergänzen.')).toBe(true);
    expect(voice.explicitTaskCreationRequested('Please create a ticket for this.')).toBe(true);
  });

  test('filters likely TTS echo without suppressing new user input', () => {
    expect(voice.isLikelyPlaybackEcho(
      'Ich habe die Aufgabe an Codex übergeben und höre weiter zu.',
      'Ich habe die Aufgabe an Codex übergeben und höre weiter zu.',
    )).toBe(true);
    expect(voice.isLikelyPlaybackEcho(
      'Ergänze bitte noch einen mobilen Browser-Test.',
      'Ich habe die Aufgabe an Codex übergeben und höre weiter zu.',
    )).toBe(false);
    expect(voice.isLikelyPlaybackEcho('Alles klar.', 'Alles klar.')).toBe(true);
    expect(voice.isLikelyPlaybackEcho('Ja', 'Ja')).toBe(false);
  });

  test('persists sanitized dispatcher milestones and throttles progress speech', () => {
    expect(voice.notifyVoiceJobStatus(taskId, 'running')).toBe(true);
    expect(voice.notifyVoiceJobProgress(taskId, 'Ich')).toBe(false);
    expect(voice.notifyVoiceJobProgress(taskId, 'Ich prüfe gerade die API-Validierung. Danach folgen die UI-Tests.')).toBe(true);
    expect(voice.notifyVoiceJobProgress(taskId, 'Diese Meldung kommt zu schnell.')).toBe(false);
    expect(voice.notifyVoiceJobStatus(taskId, 'done')).toBe(true);

    const events = chat.listProjectChatEvents(chatId, 0);
    expect(events.map((event) => event.type)).toEqual([
      'voice_job_update',
      'voice_job_progress',
      'voice_job_update',
    ]);
    expect(events[1]?.payload).toMatchObject({
      detail: 'Ich prüfe gerade die API-Validierung.',
      announce: true,
    });
    expect(voice.getVoiceStatus(chatId, admin).jobs[0]).toMatchObject({
      taskId,
      taskKey: expect.stringMatching(/^VOICE-/),
      status: 'queued',
      latestProgress: 'Ich prüfe gerade die API-Validierung.',
    });
  });
});
