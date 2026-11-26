import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { buildSandboxRunner, runProjectChatHarnessTurn } from '../server/lib/project-chat-harness';

let root: string;
let store: string;
let executable: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'kanban-claude-chat-'));
  store = path.join(root, 'login');
  executable = path.join(root, 'claude');
  await mkdir(store);
  vi.stubEnv('HOME', root);
  vi.stubEnv('CLAUDE_CONFIG_DIR', store);
  vi.stubEnv('CLAUDE_SECURESTORAGE_CONFIG_DIR', store);
  vi.stubEnv('KANBAN_CLAUDE_COMMAND', executable);
  vi.stubEnv('KANBAN_CHAT_DISABLE_SYSTEMD_SANDBOX', '1');
  await writeFile(path.join(store, '.credentials.json'), 'expired');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function turn() {
  return runProjectChatHarnessTurn({
    threadId: 'chat', harness: 'claude', agentModel: 'claude-opus-5-5', reasoningEffort: 'high',
    workspacePath: root, sessionRoot: path.join(root, 'session'), credentialConfigPath: path.join(root, 'kanban.json'),
    nativeSessionId: null, prompt: 'test message', signal: new AbortController().signal,
    onText: () => {}, onActivity: () => {},
  });
}

test('refreshes the host login before starting the prompt with session-local settings', async () => {
  await writeFile(executable, `#!/bin/sh
set -eu
if [ "$1" = '--setting-sources' ]; then
  test "$PWD" = '/' && test "$#" = 5 && test -z "$2" && test "$3 $4 $5" = 'auth status --json' || exit 2
  test "$CLAUDE_CONFIG_DIR" = "$CLAUDE_SECURESTORAGE_CONFIG_DIR"
  echo current > "$CLAUDE_SECURESTORAGE_CONFIG_DIR/.credentials.tmp"
  mv "$CLAUDE_SECURESTORAGE_CONFIG_DIR/.credentials.tmp" "$CLAUDE_SECURESTORAGE_CONFIG_DIR/.credentials.json"
  exit 0
fi
test "$CLAUDE_CONFIG_DIR" = "$PWD/session/claude"
test "$(cat "$CLAUDE_SECURESTORAGE_CONFIG_DIR/.credentials.json")" = current
grep -q 'test message'
echo '{"type":"result","subtype":"success","result":"ok","session_id":"first-session"}'
`, { mode: 0o700 });
  await expect(turn()).resolves.toEqual({ text: 'ok', nativeSessionId: 'first-session' });

  vi.stubEnv('KANBAN_CHAT_DISABLE_SYSTEMD_SANDBOX', '0');
  const runner = buildSandboxRunner({
    executable, args: [], unitName: 'chat', workspacePath: root, sessionRoot: path.join(root, 'session'),
    harness: 'claude', mode: 'read_only', credentialConfigPath: '', skillDirectory: '', artifactDirectory: '',
  });
  expect(runner.args.filter(arg => arg.startsWith('--property=ReadWritePaths=')))
    .toEqual([`--property=ReadWritePaths=${path.join(root, 'session')}`]);
});

test('does not send a prompt when the login check fails', async () => {
  await writeFile(executable, `#!/bin/sh
if [ "$1" = '--setting-sources' ]; then exit 1; fi
echo unexpected > "$CLAUDE_SECURESTORAGE_CONFIG_DIR/prompt-started"
`, { mode: 0o700 });
  await expect(turn()).rejects.toThrow('chat_claude_auth_failed');
  await expect(readFile(path.join(store, 'prompt-started'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('classifies a provider authentication failure even when the status check passed', async () => {
  await writeFile(executable, `#!/bin/sh
if [ "$1" = '--setting-sources' ]; then exit 0; fi
echo '{"type":"assistant","error":"authentication_failed"}'
echo '{"type":"result","subtype":"success","is_error":true,"result":"OAuth access token has expired"}'
exit 1
`, { mode: 0o700 });
  await expect(turn()).rejects.toThrow('chat_claude_auth_failed');
});
