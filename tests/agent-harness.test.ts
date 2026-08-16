import { describe, expect, test } from 'vitest';
import {
  CODEX_MODEL,
  QWEN_MODEL_ID,
  QWEN_MODEL_PROVIDER,
  QWEN_OPENCODE_MODEL,
  harnessExecutable,
} from '../server/lib/agent-harness';
import { buildExternalArgs, parseJsonObject } from '../server/lib/external-agent';

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
});
