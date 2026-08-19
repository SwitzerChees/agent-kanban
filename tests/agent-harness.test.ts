import { describe, expect, test } from 'vitest';
import {
  CODEX_MODEL,
  QWEN_MODEL_ID,
  QWEN_MODEL_PROVIDER,
  QWEN_OPENCODE_MODEL,
  harnessExecutable,
} from '../server/lib/agent-harness';
import {
  buildExternalArgs,
  buildExternalRefinementPrompt,
  externalRefinementSessionId,
  parseJsonObject,
  remainingAssistantText,
} from '../server/lib/external-agent';
import { parseAgentWaitRequest } from '../server/lib/agent-wait';
import { buildTaskHarnessRunner, taskHarnessResourceProperties } from '../server/lib/task-harness-sandbox';
import { taskCodexSandboxOverrides } from '../server/lib/codex';
import refinementToolBudget, { PRIME_REFINEMENT_MAX_TOOL_CALLS } from '../server/prime-extensions/refinement-tool-budget';
import {
  activityFromEvent,
  assistantTextFromEvent,
  buildSandboxRunner,
  buildProjectChatArgs,
  projectChatSystemPrompt,
  sessionIdFromEvent,
  toolActivityFromEvent,
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
    expect(buildExternalArgs({
      ...common,
      harness: 'opencode',
      reasoningEffort: 'medium',
      nativeSessionId: 'open-task-session',
    })).toEqual(expect.arrayContaining(['--session', 'open-task-session']));
    expect(buildExternalArgs({
      ...common,
      harness: 'prime-agent',
      reasoningEffort: 'xhigh',
      nativeSessionId: 'prime-task-session',
      sessionRoot: '/tmp/task-session',
    })).toEqual(expect.arrayContaining(['--session-dir', '/tmp/task-session/prime-sessions', '--resume', 'prime-task-session']));
  });

  test('resolves both host installations and accepts plain or fenced structured output', () => {
    expect(harnessExecutable('opencode')).toMatch(/opencode$/);
    expect(harnessExecutable('prime-agent')).toMatch(/prime-agent$/);
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  test('bounds Prime Agent refinement inspection before its empty-response turn limit', () => {
    let toolCallHandler: ((event: unknown) => unknown) | null = null;
    refinementToolBudget({
      on(event: string, handler: (event: unknown) => unknown) {
        if (event === 'tool_call') toolCallHandler = handler;
      },
    } as never);

    expect(toolCallHandler).not.toBeNull();
    for (let index = 0; index < PRIME_REFINEMENT_MAX_TOOL_CALLS; index += 1) {
      expect(toolCallHandler!({})).toBeUndefined();
    }
    expect(toolCallHandler!({})).toMatchObject({
      block: true,
      reason: expect.stringContaining('return the required final JSON'),
    });

    const args = buildExternalArgs({
      harness: 'prime-agent',
      reasoningEffort: 'xhigh',
      workspacePath: '/tmp/agent-kanban-harness-test',
      prompt: 'Refine the task.',
      signal: new AbortController().signal,
      timeoutMs: 60_000,
      autonomous: false,
      turnNumber: 1,
      onEvent: () => {},
    });
    expect(args[args.indexOf('--extension') + 1]).toMatch(/refinement-tool-budget\.ts$/);
  });

  test('keeps external refinement sessions resumable and demands strict repair output', () => {
    const common = {
      reasoningEffort: 'medium' as const,
      workspacePath: '/tmp/agent-kanban-harness-test',
      prompt: 'Refine the task.',
      signal: new AbortController().signal,
      timeoutMs: 60_000,
      autonomous: false,
      turnNumber: 2,
      onEvent: () => {},
      nativeSessionId: 'refinement-session-1',
      sessionRoot: '/tmp/refinement-session-root',
    };
    expect(buildExternalArgs({ ...common, harness: 'opencode' }))
      .toEqual(expect.arrayContaining(['--session', 'refinement-session-1']));
    const primeArgs = buildExternalArgs({ ...common, harness: 'prime-agent' });
    expect(primeArgs).toEqual(expect.arrayContaining([
      '--session-dir', '/tmp/refinement-session-root/prime-sessions',
      '--resume', 'refinement-session-1',
    ]));
    expect(primeArgs).not.toContain('--no-session');
    expect(buildExternalArgs({ ...common, harness: 'prime-agent', disableTools: true }))
      .toContain('--no-tools');

    const repair = buildExternalRefinementPrompt({
      harness: 'opencode',
      prompt: 'Original prompt',
      outputSchema: { type: 'object', required: ['status'] },
    }, true, '{"status":"completed","result":{"visuals":[]}}');
    expect(repair).toContain('previous response did not match');
    expect(repair).toContain('Previous response to correct:');
    expect(repair).toContain('{"status":"completed","result":{"visuals":[]}}');
    expect(repair).toContain('Return exactly one JSON object and nothing else');
    expect(repair).not.toContain('Original prompt');
  });

  test('resumes compacted Prime refinements but isolates malformed-output repairs', () => {
    expect(externalRefinementSessionId('prime-agent', true, '{"invalid":true}', 'prime-session')).toBeNull();
    expect(externalRefinementSessionId('prime-agent', true, null, 'prime-session')).toBe('prime-session');
    expect(externalRefinementSessionId('prime-agent', false, null, 'prime-session')).toBe('prime-session');
    expect(externalRefinementSessionId('opencode', true, '{"invalid":true}', 'opencode-session'))
      .toBe('opencode-session');

    const continuation = buildExternalRefinementPrompt({
      harness: 'prime-agent',
      prompt: 'Original prompt',
      outputSchema: { type: 'object', required: ['status'] },
    }, true, null);
    expect(continuation).toContain('completed automatic compaction');
    expect(continuation).toContain('Do not inspect the repository further or call tools');
    expect(continuation).not.toContain('Original prompt');
  });

  test('does not duplicate streamed Prime output when message_end restores leading whitespace', () => {
    const json = '{"status":"completed"}';
    expect(remainingAssistantText(`\n\n${json}`, json)).toBe('');
    expect(remainingAssistantText(`\n\n${json} trailing`, json)).toBe(' trailing');
    expect(remainingAssistantText('different final text', json)).toBe('different final text');
  });

  test('accepts only a terminal, bounded external wait request', () => {
    expect(parseAgentWaitRequest([
      'CI has been queued.',
      '<agent-kanban-wait>{"kind":"ci","reason":"GitHub Actions is pending","resumeAfterSeconds":20}</agent-kanban-wait>',
    ].join('\n'))).toEqual({
      kind: 'ci',
      reason: 'GitHub Actions is pending',
      resumeAfterSeconds: 60,
    });
    expect(parseAgentWaitRequest('<agent-kanban-wait>{"kind":"deployment","reason":"Rollout pending","resumeAfterSeconds":9999}</agent-kanban-wait>'))
      .toMatchObject({ kind: 'deployment', resumeAfterSeconds: 900 });
    expect(parseAgentWaitRequest('<agent-kanban-wait>{"kind":"ci","reason":"Pending","resumeAfterSeconds":300}</agent-kanban-wait>\nMore work'))
      .toBeNull();
    expect(parseAgentWaitRequest('<agent-kanban-wait>{"kind":"work","reason":"Implementing","resumeAfterSeconds":300}</agent-kanban-wait>'))
      .toBeNull();
  });

  test('isolates each task run in one persistent browser session and one killable systemd cgroup', () => {
    const common = {
      executable: '/usr/bin/example-agent',
      args: ['run'],
      workspacePath: '/tmp/agent-kanban-task/tree',
      sessionRoot: '/tmp/agent-kanban-sessions/run-123',
      harness: 'codex' as const,
    };
    const first = buildTaskHarnessRunner({
      ...common,
      unitName: 'agent-kanban-task-task1-run1-0-a',
    });
    const nextTurn = buildTaskHarnessRunner({
      ...common,
      unitName: 'agent-kanban-task-task1-run1-0-b',
    });
    expect(first.command).toBe('sudo');
    expect(first.unitName).toBe('agent-kanban-task-task1-run1-0-a');
    expect(first.browserSession).toBe(nextTurn.browserSession);
    expect(first.args).toEqual(expect.arrayContaining([
      '--property=ReadOnlyPaths=/',
      '--property=KillMode=control-group',
      '--property=MemoryHigh=2048M',
      '--property=MemoryMax=3072M',
      '--property=TasksMax=1024',
      '--property=OOMPolicy=stop',
      '--property=NoNewPrivileges=yes',
      '--setenv=AGENT_BROWSER_SESSION=task-run-123',
      '--',
      '/usr/bin/example-agent',
      'run',
    ]));
  });

  test('bounds task cgroup resource overrides and keeps the hard limit above the throttle', () => {
    expect(taskHarnessResourceProperties({
      KANBAN_TASK_MEMORY_HIGH_MB: '4096',
      KANBAN_TASK_MEMORY_MAX_MB: '1024',
      KANBAN_TASK_MAX_PROCESSES: '12',
    })).toEqual([
      'MemoryHigh=4096M',
      'MemoryMax=4096M',
      'TasksMax=64',
      'OOMPolicy=stop',
    ]);
  });

  test('does not nest the Codex bwrap sandbox inside the task systemd sandbox', () => {
    expect(taskCodexSandboxOverrides(true, 'workspace-write', null)).toEqual({
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
    });
    expect(taskCodexSandboxOverrides(false, 'workspace-write', null)).toEqual({
      sandbox: 'workspace-write',
      sandboxPolicy: null,
    });
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

  test('gives Prime Agent a writable session-local configuration directory', () => {
    const runner = buildSandboxRunner({
      executable: 'prime-agent',
      args: ['--print'],
      unitName: 'chat-test',
      workspacePath: '/tmp/project-chat',
      sessionRoot: '/tmp/project-chat-session',
      harness: 'prime-agent',
      mode: 'read_only',
      credentialConfigPath: '/tmp/project-chat-session/kanban.json',
      skillDirectory: '/tmp/project-chat-session/skills/agent-kanban-control',
      artifactDirectory: '/tmp/project-chat-session/artifacts',
    });
    expect(runner.env.PRIME_AGENT_CODING_AGENT_DIR).toBe('/tmp/project-chat-session/prime-agent');
    expect(runner.args).toContain('--setenv=PRIME_AGENT_CODING_AGENT_DIR=/tmp/project-chat-session/prime-agent');
  });

  test('gives the voice orchestrator a writable chat-worktree contract without creating board tasks', () => {
    expect(projectChatSystemPrompt('orchestrator')).toContain('isolated Git worktree');
    expect(projectChatSystemPrompt('orchestrator')).toContain('only when the user explicitly asks');
    expect(projectChatSystemPrompt('read_only')).toContain('strictly read-only conversation');
    expect(projectChatSystemPrompt('read_only')).toContain('agent-kanban-control');
    expect(projectChatSystemPrompt('read_only')).toContain("current user's permissions");
    expect(projectChatSystemPrompt('orchestrator', '# Mandatory Project Instructions\nUse DESIGN.md.'))
      .toContain('Use DESIGN.md.');
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

  test('passes injected project guidance to Prime Agent as a system prompt', () => {
    const args = buildProjectChatArgs({
      reasoningEffort: 'medium',
      workspacePath: '/tmp/project-chat',
      sessionRoot: '/tmp/project-chat-session',
      threadId: 'chat-guidance',
      prompt: 'Implement the task.',
      projectInstructions: '# Mandatory Project Instructions\nFollow DESIGN.md.',
      harness: 'prime-agent',
      nativeSessionId: null,
      mode: 'orchestrator',
    });
    const systemPrompt = args[args.indexOf('--append-system-prompt') + 1];
    expect(systemPrompt).toContain('Follow DESIGN.md.');
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
    expect(assistantTextFromEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta' },
      delta: 'Live update',
    }, 'prime-agent')).toEqual({ text: 'Live update', full: false });
    expect(assistantTextFromEvent({
      type: 'text',
      part: { type: 'text', text: 'OpenCode update' },
    }, 'opencode')).toEqual({ text: 'OpenCode update', full: true });
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

  test('exposes concise, redacted tool activity without raw payloads', () => {
    expect(toolActivityFromEvent({
      type: 'item.started',
      item: { id: 'cmd-1', type: 'command_execution', command: 'python agent_kanban.py request GET /api/projects' },
    })).toMatchObject({
      id: 'cmd-1',
      kind: 'kanban',
      status: 'running',
      detail: 'python agent_kanban.py request GET /api/projects',
    });
    expect(toolActivityFromEvent({
      type: 'tool_execution_start',
      toolName: 'shell',
      command: '--password private-value',
    })?.detail).not.toContain('private-value');
  });
});
