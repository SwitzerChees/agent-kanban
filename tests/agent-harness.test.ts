import { describe, expect, test } from 'vitest';
import {
  CODEX_MODEL,
  QWEN_MODEL_ID,
  QWEN_MODEL_PROVIDER,
  QWEN_OPENCODE_MODEL,
  harnessExecutable,
} from '../server/lib/agent-harness';
import { buildExternalArgs, parseJsonObject } from '../server/lib/external-agent';
import {
  activityFromEvent,
  assistantTextFromEvent,
  buildProjectChatArgs,
  projectChatSystemPrompt,
  sessionIdFromEvent,
} from '../server/lib/project-chat-harness';

describe('agent harness runtime contracts', () => {
  test('keeps model selection fixed while forwarding only the selected effort', () => {
    expect(CODEX_MODEL).toBe('gpt-5.6-sol');
    expect(QWEN_OPENCODE_MODEL).toBe('homelab-qwen-3-8-27b/Qwen/Qwen3.8-27B');

    const common = {
      workspacePath: '/tmp/agent-kanban-harness-test',
      prompt: 'Implement the task.',
      signal: new AbortController().signal,
      timeoutMs: 60_000,
      autonomous: true,
      turnNumber: 1,
      onEvent: () => {},
    };
    expect(buildExternalArgs({ ...common, harness: 'opencode', reasoningEffort: 'medium' }))
      .toEqual(expect.arrayContaining(['--model', QWEN_OPENCODE_MODEL, '--variant', 'medium']));
    expect(buildExternalArgs({ ...common, harness: 'prime-agent', reasoningEffort: 'xhigh' }))
      .toEqual(expect.arrayContaining([
        '--provider', QWEN_MODEL_PROVIDER,
        '--model', QWEN_MODEL_ID,
        '--thinking', 'xhigh',
      ]));
  });

  test('resolves both host installations and accepts plain or fenced structured output', () => {
    expect(harnessExecutable('opencode')).toMatch(/opencode$/);
    expect(harnessExecutable('prime-agent')).toMatch(/prime-agent$/);
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  test('builds resumable, non-autonomous chat turns for every harness', () => {
    const common = {
      reasoningEffort: 'medium' as const,
      workspacePath: '/tmp/project-chat',
      sessionRoot: '/tmp/project-chat-session',
      threadId: 'chat-123',
      prompt: 'Explain the authentication flow.',
    };
    expect(buildProjectChatArgs({ ...common, harness: 'prime-agent', nativeSessionId: 'prime-1' }))
      .toEqual(expect.arrayContaining(['--mode', 'json', '--resume', 'prime-1', '--session-dir']));
    expect(buildProjectChatArgs({ ...common, harness: 'opencode', nativeSessionId: 'open-1' }))
      .toEqual(expect.arrayContaining(['--format', 'json', '--agent', 'explore', '--session', 'open-1']));
    expect(buildProjectChatArgs({ ...common, harness: 'codex', nativeSessionId: 'codex-1' }))
      .toEqual(expect.arrayContaining(['exec', 'resume', '--json', 'codex-1']));
    expect(buildProjectChatArgs({ ...common, harness: 'opencode', nativeSessionId: null }))
      .not.toContain('--auto');
    for (const harness of ['codex', 'opencode', 'prime-agent'] as const) {
      expect(buildProjectChatArgs({ ...common, harness, nativeSessionId: null }).join(' '))
        .not.toContain(common.prompt);
    }
  });

  test('gives the voice orchestrator a writable chat-worktree contract without creating board tasks', () => {
    expect(projectChatSystemPrompt('orchestrator')).toContain('isolated Git worktree');
    expect(projectChatSystemPrompt('orchestrator')).toContain('Never create a task, card, ticket');
    expect(projectChatSystemPrompt('read_only')).toContain('strictly read-only conversation');
    const args = buildProjectChatArgs({
      reasoningEffort: 'xhigh',
      workspacePath: '/tmp/project-chat',
      sessionRoot: '/tmp/project-chat-session',
      threadId: 'chat-voice',
      prompt: 'Fix the issue.',
      harness: 'opencode',
      nativeSessionId: null,
      mode: 'orchestrator',
    });
    expect(args).toEqual(expect.arrayContaining(['--agent', 'build']));
  });

  test('parses Prime Agent session headers and streaming text events', () => {
    expect(sessionIdFromEvent({ type: 'session', id: 'prime-session-1' }, 'prime-agent'))
      .toBe('prime-session-1');
    expect(assistantTextFromEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello' },
    }, 'prime-agent')).toEqual({ text: 'Hello', full: false });
    expect(assistantTextFromEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'toolcall_delta', delta: '{"code":' },
    }, 'prime-agent')).toBeNull();
    expect(assistantTextFromEvent({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] },
    }, 'prime-agent')).toEqual({ text: 'Hello world', full: true });
  });

  test('reduces raw tool events to generic project or web activity', () => {
    expect(activityFromEvent({
      type: 'tool_execution_start',
      toolName: 'ipython',
      args: { code: 'open("package.json")' },
    })).toBe('project');
    expect(activityFromEvent({
      type: 'tool_execution_start',
      toolName: 'ipython',
      args: { code: 'agent-browser open https://nuxt.com' },
    })).toBe('web');
  });
});
