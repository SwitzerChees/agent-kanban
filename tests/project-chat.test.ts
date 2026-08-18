import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-project-chat-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'project-chat-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'project-chat-password';

let dbModule: typeof import('../server/lib/db');
let chatModule: typeof import('../server/lib/project-chat');
let runtimeModule: typeof import('../server/lib/project-chat-runtime');
let owner: User;
let other: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  chatModule = await import('../server/lib/project-chat');
  runtimeModule = await import('../server/lib/project-chat-runtime');
  const now = new Date().toISOString();
  owner = dbModule.db.select().from(dbModule.schema.users).get()!;
  other = {
    id: randomUUID(),
    email: 'other@example.com',
    name: 'Other user',
    passwordHash: owner.passwordHash,
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  projectId = randomUUID();
  dbModule.db.insert(dbModule.schema.users).values(other).run();
  dbModule.db.insert(dbModule.schema.projects).values({
    id: projectId,
    key: 'CHAT',
    name: 'Chat project',
    description: null,
    folderPath: testRoot,
    createdBy: owner.id,
    createdAt: now,
    updatedAt: now,
  }).run();
  dbModule.db.insert(dbModule.schema.projectUsers).values({
    projectId,
    userId: other.id,
    role: 'member',
    createdAt: now,
  }).run();
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('private project chats', () => {
  test('rewrites only inline images inside the chat-owned folders', () => {
    const artifactRoot = path.join(testRoot, 'data', 'chat-sessions', 'chat-1', 'artifacts');
    const imagePath = path.join(artifactRoot, 'screen.png');
    const outsidePath = path.join(testRoot, 'secret.png');
    const rewritten = runtimeModule.rewriteProjectChatArtifacts(
      `![Screenshot](${imagePath})\n![Outside](${outsidePath})`,
      'chat-1',
      [artifactRoot],
    );
    expect(rewritten).toContain('/api/project-chats/chat-1/artifacts/');
    expect(rewritten).toContain(`![Outside](${outsidePath})`);
  });

  test('stores the user message before its assistant placeholder deterministically', () => {
    const timestamps = runtimeModule.turnMessageTimestamps(Date.parse('2026-08-16T20:00:00.000Z'));
    expect(timestamps).toEqual({
      userCreatedAt: '2026-08-16T20:00:00.000Z',
      assistantCreatedAt: '2026-08-16T20:00:00.001Z',
    });
  });

  test('keeps exactly one current chat per project and owner', () => {
    const first = chatModule.createProjectChat(projectId, {}, owner).chat;
    expect(first.harness).toBe('prime-agent');
    expect(first.reasoningEffort).toBe('low');
    expect(chatModule.getCurrentProjectChat(projectId, owner).chat?.id).toBe(first.id);

    const second = chatModule.createProjectChat(projectId, {
      harness: 'codex',
      reasoningEffort: 'medium',
    }, owner).chat;
    expect(second.id).not.toBe(first.id);
    expect(chatModule.getCurrentProjectChat(projectId, owner).chat?.id).toBe(second.id);
    expect(chatModule.listProjectChats(projectId, owner)).toHaveLength(2);

    const reactivated = chatModule.activateProjectChat(first.id, owner);
    expect(reactivated.chat?.id).toBe(first.id);
    expect(chatModule.getCurrentProjectChat(projectId, owner).chat?.id).toBe(first.id);
  });

  test('requires chat ownership even when another user belongs to the project', () => {
    const owned = chatModule.getCurrentProjectChat(projectId, owner).chat!;
    expect(() => chatModule.authorizeProjectChat(owned.id, other)).toThrow(/chat_not_found/);
    expect(chatModule.getCurrentProjectChat(projectId, other).chat).toBeNull();
  });

  test('locks harness configuration after the conversation starts and streams ordered events', () => {
    const thread = chatModule.getCurrentProjectChat(projectId, owner).chat!;
    const now = new Date().toISOString();
    dbModule.db.insert(dbModule.schema.projectChatMessages).values({
      id: randomUUID(),
      threadId: thread.id,
      role: 'user',
      content: 'Explain the project.',
      state: 'complete',
      clientRequestId: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }).run();
    expect(() => chatModule.updateProjectChat(thread.id, { harness: 'opencode' }, owner))
      .toThrow(/chat_config_locked/);

    const firstId = chatModule.appendProjectChatEvent(thread.id, 'activity', { activity: 'project' });
    const secondId = chatModule.appendProjectChatEvent(thread.id, 'message_updated', { content: 'Hello' });
    expect(secondId).toBeGreaterThan(firstId);
    expect(chatModule.listProjectChatEvents(thread.id, firstId)).toEqual([
      expect.objectContaining({ id: secondId, type: 'message_updated', payload: { content: 'Hello' } }),
    ]);
  });

  test('keeps chat attachments private, visible in history, and explicit in the agent prompt', () => {
    const thread = chatModule.createProjectChat(projectId, {}, owner).chat;
    const now = new Date().toISOString();
    const attachment = {
      id: randomUUID(),
      fileName: 'product sketch.png',
      mimeType: 'image/png',
      size: 128,
      storagePath: path.join(testRoot, 'data', 'chat-sessions', thread.id, 'uploads', 'product-sketch.png'),
    };
    dbModule.db.insert(dbModule.schema.projectChatMessages).values({
      id: randomUUID(),
      threadId: thread.id,
      role: 'user',
      content: 'Please review this.',
      attachmentsJson: JSON.stringify([attachment]),
      state: 'complete',
      clientRequestId: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }).run();

    const payload = chatModule.getProjectChat(thread.id, owner);
    expect(payload.messages[0]?.attachments).toEqual([expect.objectContaining({
      id: attachment.id,
      fileName: attachment.fileName,
      url: `/api/project-chats/${thread.id}/attachments/${attachment.id}`,
    })]);
    expect(JSON.stringify(payload)).not.toContain(attachment.storagePath);
    expect(runtimeModule.buildProjectChatPrompt('Please review this.', [attachment]))
      .toContain('untrusted reference data');
  });
});
