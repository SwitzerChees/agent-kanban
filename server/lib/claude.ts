import type { Writable } from 'node:stream';
import type { CodexSteeringBatch } from './codex';
import { mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CLAUDE_MODEL, type AgentModel, type TaskReasoningEffort } from '../../shared/agent-runtime';

const hostClaudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const credentialDir = () => process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR || hostClaudeDir();
export const claudeCredentialPath = () => path.join(credentialDir(), '.credentials.json');

export function claudeEnvironment(sessionRoot: string) {
  return {
    CLAUDE_CONFIG_DIR: path.join(sessionRoot, 'claude'),
    CLAUDE_SECURESTORAGE_CONFIG_DIR: credentialDir(),
  };
}

// The CLI keeps transcripts in the session and uses the service user's native
// login store directly. Session directories contain no copied login tokens.
export async function prepareClaudeSession(sessionRoot: string, skills = path.join(hostClaudeDir(), 'skills')) {
  const dir = claudeEnvironment(sessionRoot).CLAUDE_CONFIG_DIR;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await symlink(skills, path.join(dir, 'skills'), 'dir');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export function claudeArgs(options: {
  model?: AgentModel;
  reasoningEffort: TaskReasoningEffort;
  nativeSessionId?: string | null;
  tools: string;
}) {
  return [
    '--print', '--verbose', '--output-format', 'stream-json',
    '--model', options.model ?? DEFAULT_CLAUDE_MODEL,
    '--effort', options.reasoningEffort, '--permission-mode', 'dontAsk',
    '--strict-mcp-config', '--setting-sources', '',
    '--tools', options.tools, '--allowedTools', options.tools,
    ...(options.nativeSessionId ? ['--resume', options.nativeSessionId] : []),
  ];
}

export const CLAUDE_TASK_TOOLS = 'Read,Glob,Grep,Edit,Write,Bash,WebFetch,WebSearch,Skill';
export const CLAUDE_INSPECTION_TOOLS = 'Read,Glob,Grep';

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: { command?: string; file_path?: string };
  tool_use_id?: string;
  is_error?: boolean;
}

export function claudeBlocks(event: Record<string, unknown>): ContentBlock[] {
  const content = (event.message as { content?: unknown } | undefined)?.content;
  return Array.isArray(content) ? content.filter(block => block && typeof block === 'object') : [];
}

// A tool result carries only its ID. Keep just the display fields needed to
// correlate it with its invocation; never forward file contents or results.
export function claudeToolTracker() {
  const calls = new Map<string, { id: string; toolName: string; command?: string; path?: string }>();
  return (event: Record<string, unknown>) => {
    const updates = [];
    for (const block of claudeBlocks(event)) {
      if (event.type === 'assistant' && block.type === 'tool_use' && block.id && block.name) {
        const call = { id: block.id, toolName: block.name, command: block.input?.command, path: block.input?.file_path };
        calls.set(call.id, call);
        updates.push({ ...call, type: 'tool_execution_start' });
      }
      if (event.type === 'user' && block.type === 'tool_result' && block.tool_use_id) {
        const call = calls.get(block.tool_use_id);
        if (!call) continue;
        calls.delete(call.id);
        updates.push({ ...call, type: block.is_error ? 'tool_execution_failed' : 'tool_execution_end' });
      }
    }
    return updates;
  };
}

export function claudeTextDelta(message: Record<string, unknown>) {
  const event = message.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
  return message.type === 'stream_event' && event?.type === 'content_block_delta' && event.delta?.type === 'text_delta'
    ? event.delta.text : undefined;
}

// A CLI run can emit assistant text and still fail in its terminal result.
export function claudeResultError(event: Record<string, unknown>) {
  if (event.type !== 'result' || (event.subtype === 'success' && !event.is_error)) return null;
  const details = typeof event.result === 'string' && event.result || (Array.isArray(event.errors) && event.errors.join(' '));
  return String(details || event.subtype || 'claude_failed').slice(-2000);
}

export function streamClaudeInput(stdin: Writable, prompt: string, loadSteering: () => Promise<CodexSteeringBatch | null>, onDelivery: (message: string) => void) {
  const userMessage = (content: string) => JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
  stdin.write(userMessage(prompt));
  let polling = false;
  const timer = setInterval(async () => {
    if (polling || !stdin.writable) return;
    polling = true;
    try {
      const batch = await loadSteering();
      if (!batch || !stdin.writable) return;
      const content = batch.input.map(item => item.type === 'text' ? item.text : item.path).join('\n');
      await new Promise<void>((resolve, reject) => stdin.write(userMessage(content), err => err ? reject(err) : resolve()));
      batch.markDelivered?.();
      onDelivery(batch.description ?? 'New task guidance sent to Claude.');
    } catch {
      // Leave the batch pending for the next poll or the continuation turn.
    } finally {
      polling = false;
    }
  }, 2000);
  timer.unref();
  return () => {
    clearInterval(timer);
    if (stdin.writable) stdin.end();
  };
}
