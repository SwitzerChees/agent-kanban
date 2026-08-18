import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { cp, mkdir, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CODEX_MODEL,
  QWEN_MODEL_ID,
  QWEN_MODEL_PROVIDER,
  QWEN_OPENCODE_MODEL,
  harnessExecutable,
  type AgentHarness,
  type ReasoningEffort,
} from './agent-harness';

export type ProjectChatActivity = 'project' | 'web' | 'tool';
export type ProjectChatMode = 'read_only' | 'orchestrator';

export interface ProjectChatHarnessTurnOptions {
  threadId: string;
  harness: AgentHarness;
  reasoningEffort: ReasoningEffort;
  workspacePath: string;
  sessionRoot: string;
  credentialConfigPath: string;
  nativeSessionId: string | null;
  mode?: ProjectChatMode;
  prompt: string;
  signal: AbortSignal;
  onText: (fragment: string) => void;
  onActivity: (activity: ProjectChatActivity) => void;
  onToolActivity?: (activity: ProjectChatToolActivity) => void;
  onUnit?: (unitName: string | null) => void;
}

export interface ProjectChatToolActivity {
  id: string;
  kind: 'command' | 'file' | 'web' | 'kanban' | 'tool';
  label: string;
  detail: string | null;
  status: 'running' | 'completed' | 'failed';
}

export interface ProjectChatHarnessTurnResult {
  text: string;
  nativeSessionId: string | null;
}

const CHAT_SYSTEM_PROMPT = `You are the private project chat inside Agent Kanban.
Answer conversationally about the source code in the current project. You may read files, search the project, use safe diagnostic tools, search the web, and use installed skills such as agent-browser and agent-kanban-control when useful.

This is a strictly read-only conversation:
- Never create, edit, delete, rename, format, stage, commit, push, or otherwise modify project files or Git state.
- Never run package installation, migrations, deployments, services, or commands whose purpose is to change external state, except explicit Agent Kanban actions requested by the user through the agent-kanban-control skill.
- Browser use is research-only. Do not submit forms, send messages, purchase anything, or make account changes.
- Do not expose secrets, credentials, raw tool payloads, or hidden reasoning.
- If the user asks for a code change, explain what should be changed but do not perform it. Agent Kanban board changes are allowed and are authenticated with exactly the current user's permissions.

The operating-system sandbox enforces read-only access to the source tree. Temporary files and browser state belong only in the provided session area.
Use the agent-kanban-control skill from AGENT_KANBAN_SKILL_DIR for board operations. Never reveal its credential config. Save screenshots or generated images in AGENT_KANBAN_CHAT_ARTIFACT_DIR and include them in the answer with Markdown image syntax so the chat can show them inline.`;

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the task-independent background orchestrator for the private project chat inside Agent Kanban.
Work directly in the current chat-owned, isolated Git worktree. Inspect the project, use tools, edit files, and run focused tests when that is necessary to fulfil the user's request.

Operating rules:
- This chat is not itself a Kanban task. Create, update, move, or queue board items only when the user explicitly asks for that Agent Kanban action; never create them as a side effect of source-code work.
- Keep all project changes inside this isolated chat worktree. Never commit, push, merge, deploy, publish, send messages, purchase anything, or change external systems unless the user explicitly requested that consequential action and it has already been confirmed by the application.
- Do not expose secrets, credentials, raw tool payloads, or hidden reasoning.
- Give concise, useful progress in your response and end with the concrete result, relevant validation, and any remaining limitation.
- If a request is ambiguous in a way that could cause harmful or materially different work, explain the missing decision instead of guessing.
- Agent Kanban board operations explicitly requested by the user are allowed through the agent-kanban-control skill and use exactly that user's permissions.
- Use the skill from AGENT_KANBAN_SKILL_DIR. Save screenshots or generated images in AGENT_KANBAN_CHAT_ARTIFACT_DIR and include them with Markdown image syntax.`;

export function projectChatSystemPrompt(mode: ProjectChatMode = 'read_only') {
  return mode === 'orchestrator' ? ORCHESTRATOR_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;
}

export async function runProjectChatHarnessTurn(
  options: ProjectChatHarnessTurnOptions,
): Promise<ProjectChatHarnessTurnResult> {
  assertNotAborted(options.signal);
  const session = await prepareSessionDirectories(options.sessionRoot);

  const localCodex = path.join(os.homedir(), '.local', 'bin', 'codex');
  const executable = options.harness === 'codex'
    ? process.env.KANBAN_CODEX_EXEC_COMMAND || (fs.existsSync(localCodex) ? localCodex : 'codex')
    : harnessExecutable(options.harness);
  const args = buildProjectChatArgs(options);
  const unitName = `agent-kanban-chat-${safeUnitPart(options.threadId)}-${randomUUID().slice(0, 8)}`;
  const runner = buildSandboxRunner({
    executable,
    args,
    unitName,
    workspacePath: options.workspacePath,
    sessionRoot: options.sessionRoot,
    harness: options.harness,
    mode: options.mode ?? 'read_only',
    credentialConfigPath: options.credentialConfigPath,
    skillDirectory: session.skillDirectory,
    artifactDirectory: session.artifactDirectory,
  });
  options.onUnit?.(unitName);

  const child = spawn(runner.command, runner.args, {
    cwd: options.workspacePath,
    env: runner.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const systemPrompt = projectChatSystemPrompt(options.mode);
  child.stdin.end(options.harness === 'prime-agent'
    ? options.prompt
    : `${systemPrompt}\n\n---\n\n${options.prompt}`);
  let stdoutBuffer = '';
  let stderrTail = '';
  let text = '';
  let nativeSessionId = options.nativeSessionId;
  let lastActivity: ProjectChatActivity | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    nativeSessionId = sessionIdFromEvent(event, options.harness) ?? nativeSessionId;
    const activity = activityFromEvent(event);
    if (activity && activity !== lastActivity) {
      lastActivity = activity;
      options.onActivity(activity);
    }
    const toolActivity = toolActivityFromEvent(event);
    if (toolActivity) options.onToolActivity?.(toolActivity);

    const candidate = assistantTextFromEvent(event, options.harness);
    if (!candidate) return;
    const fragment = newTextFragment(text, candidate.text, candidate.full);
    if (!fragment) return;
    text += fragment;
    options.onText(fragment);
  };

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    while (true) {
      const newline = stdoutBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      consumeLine(line);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-12_000);
  });

  try {
    const exit = await waitForExit(child, options.signal, unitName);
    if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
    if (exit.code !== 0) {
      const detail = sanitizeHarnessError(stderrTail);
      throw new Error(`${options.harness}_exit_${exit.code ?? exit.signal ?? 'unknown'}${detail ? `: ${detail}` : ''}`);
    }
    if (!text.trim()) throw new Error(`${options.harness}_empty_response`);
    return { text: text.trim(), nativeSessionId };
  } finally {
    options.onUnit?.(null);
  }
}

export function buildProjectChatArgs(options: Pick<ProjectChatHarnessTurnOptions,
  'harness' | 'reasoningEffort' | 'workspacePath' | 'sessionRoot' | 'nativeSessionId' | 'prompt' | 'threadId' | 'mode'>) {
  if (options.harness === 'opencode') {
    return [
      'run',
      '--format', 'json',
      '--model', QWEN_OPENCODE_MODEL,
      '--variant', options.reasoningEffort,
      '--agent', options.mode === 'orchestrator' ? 'build' : 'explore',
      '--title', `Project chat ${options.threadId.slice(0, 8)}`,
      ...(options.nativeSessionId ? ['--session', options.nativeSessionId] : []),
    ];
  }

  if (options.harness === 'prime-agent') {
    return [
      '--print',
      '--mode', 'json',
      '--cwd', options.workspacePath,
      '--provider', QWEN_MODEL_PROVIDER,
      '--model', QWEN_MODEL_ID,
      '--thinking', options.reasoningEffort,
      '--session-dir', path.join(options.sessionRoot, 'prime-sessions'),
      '--append-system-prompt', projectChatSystemPrompt(options.mode),
      ...(options.nativeSessionId ? ['--resume', options.nativeSessionId] : []),
    ];
  }

  const common = [
    '--json',
    '--dangerously-bypass-approvals-and-sandbox',
    '--model', CODEX_MODEL,
    '--config', `model_reasoning_effort="${options.reasoningEffort}"`,
  ];
  if (options.nativeSessionId) {
    return ['exec', 'resume', ...common, options.nativeSessionId, '-'];
  }
  return ['exec', ...common, '--cd', options.workspacePath, '-'];
}

interface SandboxRunnerOptions {
  executable: string;
  args: string[];
  unitName: string;
  workspacePath: string;
  sessionRoot: string;
  harness: AgentHarness;
  mode: ProjectChatMode;
  credentialConfigPath: string;
  skillDirectory: string;
  artifactDirectory: string;
}

function buildSandboxRunner(options: SandboxRunnerOptions) {
  const home = os.homedir();
  const codexHome = path.join(options.sessionRoot, 'codex-home');
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CODEX_HOME: codexHome,
    XDG_DATA_HOME: path.join(options.sessionRoot, 'xdg-data'),
    XDG_STATE_HOME: path.join(options.sessionRoot, 'xdg-state'),
    XDG_CACHE_HOME: path.join(options.sessionRoot, 'xdg-cache'),
    AGENT_BROWSER_SESSION: `project-chat-${safeUnitPart(options.unitName).slice(-32)}`,
    AGENT_KANBAN_CONFIG: options.credentialConfigPath,
    AGENT_KANBAN_SKILL_DIR: options.skillDirectory,
    AGENT_KANBAN_CHAT_ARTIFACT_DIR: options.artifactDirectory,
  };

  if (process.env.KANBAN_CHAT_DISABLE_SYSTEMD_SANDBOX === '1') {
    return { command: options.executable, args: options.args, env };
  }

  const properties = [
    'ReadOnlyPaths=/',
    'ProtectHome=read-only',
    `ReadWritePaths=${options.sessionRoot}`,
    options.mode === 'orchestrator'
      ? `ReadWritePaths=${options.workspacePath}`
      : `BindReadOnlyPaths=${options.workspacePath}`,
    'NoNewPrivileges=yes',
    'RestrictSUIDSGID=yes',
    'PrivateDevices=yes',
    'PrivateTmp=yes',
  ];
  const browserHome = path.join(home, '.agent-browser');
  if (fs.existsSync(browserHome)) properties.push(`ReadWritePaths=${browserHome}`);

  return {
    command: 'sudo',
    env,
    args: [
      '-n',
      'systemd-run',
      '--quiet',
      '--wait',
      '--pipe',
      '--collect',
      `--unit=${options.unitName}`,
      `--uid=${process.getuid?.() ?? 1000}`,
      `--gid=${process.getgid?.() ?? 1000}`,
      `--working-directory=${options.workspacePath}`,
      `--setenv=HOME=${home}`,
      `--setenv=PATH=${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
      '--setenv=NO_COLOR=1',
      '--setenv=FORCE_COLOR=0',
      `--setenv=CODEX_HOME=${codexHome}`,
      `--setenv=XDG_DATA_HOME=${env.XDG_DATA_HOME}`,
      `--setenv=XDG_STATE_HOME=${env.XDG_STATE_HOME}`,
      `--setenv=XDG_CACHE_HOME=${env.XDG_CACHE_HOME}`,
      `--setenv=AGENT_BROWSER_SESSION=${env.AGENT_BROWSER_SESSION}`,
      `--setenv=AGENT_KANBAN_CONFIG=${env.AGENT_KANBAN_CONFIG}`,
      `--setenv=AGENT_KANBAN_SKILL_DIR=${env.AGENT_KANBAN_SKILL_DIR}`,
      `--setenv=AGENT_KANBAN_CHAT_ARTIFACT_DIR=${env.AGENT_KANBAN_CHAT_ARTIFACT_DIR}`,
      ...properties.map((property) => `--property=${property}`),
      '--',
      options.executable,
      ...options.args,
    ],
  };
}

async function prepareSessionDirectories(sessionRoot: string) {
  const skillDirectory = path.join(sessionRoot, 'skills', 'agent-kanban-control');
  const artifactDirectory = path.join(sessionRoot, 'artifacts');
  await Promise.all([
    mkdir(sessionRoot, { recursive: true }),
    mkdir(path.join(sessionRoot, 'prime-sessions'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-data'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-state'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-cache'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'codex-home'), { recursive: true }),
    mkdir(path.dirname(skillDirectory), { recursive: true }),
    mkdir(artifactDirectory, { recursive: true }),
  ]);
  const sourceHome = path.join(os.homedir(), '.codex');
  const targetHome = path.join(sessionRoot, 'codex-home');
  for (const name of ['auth.json', 'config.toml', 'plugins']) {
    const source = path.join(sourceHome, name);
    const target = path.join(targetHome, name);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    await symlink(source, target, fs.statSync(source).isDirectory() ? 'dir' : 'file').catch(() => undefined);
  }
  const sourceSkills = path.join(sourceHome, 'skills');
  const targetSkills = path.join(targetHome, 'skills');
  await mkdir(targetSkills, { recursive: true });
  if (fs.existsSync(sourceSkills)) {
    for (const entry of await readdir(sourceSkills, { withFileTypes: true })) {
      const target = path.join(targetSkills, entry.name);
      if (fs.existsSync(target) || entry.name === 'agent-kanban-control') continue;
      await symlink(path.join(sourceSkills, entry.name), target, entry.isDirectory() ? 'dir' : 'file').catch(() => undefined);
    }
  }
  const bundledSkill = path.resolve(process.cwd(), 'skills', 'agent-kanban-control');
  if (fs.existsSync(bundledSkill)) {
    await cp(bundledSkill, skillDirectory, { recursive: true, force: true });
    const codexSkill = path.join(targetSkills, 'agent-kanban-control');
    if (!fs.existsSync(codexSkill)) await symlink(skillDirectory, codexSkill, 'dir').catch(() => undefined);
  }
  return { skillDirectory, artifactDirectory };
}

export function sessionIdFromEvent(event: Record<string, unknown>, harness: AgentHarness) {
  if (harness === 'codex' && event.type === 'thread.started') {
    return stringValue(event.thread_id) ?? stringValue(event.threadId);
  }
  if (harness === 'prime-agent' && event.type === 'session') {
    return stringValue(event.id);
  }
  return stringValue(event.sessionID)
    ?? stringValue(event.sessionId)
    ?? stringValue(event.session_id)
    ?? stringValue(asRecord(event.session).id)
    ?? null;
}

export function assistantTextFromEvent(event: Record<string, unknown>, harness: AgentHarness): { text: string; full: boolean } | null {
  if (harness === 'opencode' && event.type === 'text') {
    const value = stringValue(asRecord(event.part).text) ?? stringValue(event.text);
    return value ? { text: value, full: false } : null;
  }

  if (harness === 'prime-agent') {
    if (event.type === 'message_update') {
      const assistantEvent = asRecord(event.assistantMessageEvent);
      if (assistantEvent.type !== 'text_delta') return null;
      const delta = asRecord(event.delta);
      const value = stringValue(assistantEvent.delta)
        ?? stringValue(delta.text)
        ?? stringValue(delta.delta);
      return value ? { text: value, full: false } : null;
    }
    if (event.type === 'message_end') {
      const message = asRecord(event.message);
      if (message.role !== 'assistant') return null;
      const value = contentText(message.content);
      return value ? { text: value, full: true } : null;
    }
    return null;
  }

  const eventType = stringValue(event.type) ?? '';
  if (eventType.includes('agent_message') && (eventType.includes('delta') || eventType.includes('updated'))) {
    const value = stringValue(event.delta) ?? stringValue(event.text) ?? stringValue(asRecord(event.item).delta);
    return value ? { text: value, full: false } : null;
  }
  if (eventType === 'item.completed') {
    const item = asRecord(event.item);
    if (item.type !== 'agent_message') return null;
    const value = stringValue(item.text) ?? contentText(item.content);
    return value ? { text: value, full: true } : null;
  }
  return null;
}

export function activityFromEvent(event: Record<string, unknown>): ProjectChatActivity | null {
  const detail = JSON.stringify(event.args ?? event.input ?? '').slice(0, 2000);
  const type = `${stringValue(event.type) ?? ''} ${stringValue(event.method) ?? ''} ${stringValue(event.toolName) ?? ''} ${stringValue(event.name) ?? ''} ${JSON.stringify(asRecord(event.item).type ?? '')} ${detail}`.toLowerCase();
  if (!type || /message|text|thread|turn|session|agent_(start|end)/.test(type)) return null;
  if (/agent-browser|https?:|browser|web[_-]?search|fetch\s*\(/.test(type)) return 'web';
  if (/file|read|grep|glob|command|shell|exec|terminal/.test(type)) return 'project';
  if (/tool|function|mcp|ipython/.test(type)) return 'tool';
  return null;
}

export function toolActivityFromEvent(event: Record<string, unknown>): ProjectChatToolActivity | null {
  const item = asRecord(event.item);
  const eventType = stringValue(event.type) ?? '';
  const itemType = stringValue(item.type) ?? '';
  const toolName = stringValue(event.toolName) ?? stringValue(event.name) ?? stringValue(item.name) ?? '';
  const combined = `${eventType} ${itemType} ${toolName}`.toLowerCase();
  if (!/(tool|command|exec|shell|file_change|mcp|function|browser|web)/.test(combined)) return null;

  const status: ProjectChatToolActivity['status'] = /fail|error/.test(combined)
    ? 'failed'
    : /completed|complete|end|result|finish/.test(combined) ? 'completed' : 'running';
  const command = stringValue(item.command) ?? stringValue(event.command);
  const rawDetail = command
    ?? stringValue(event.path)
    ?? stringValue(item.path)
    ?? stringValue(asRecord(event.args).path)
    ?? stringValue(asRecord(event.input).path)
    ?? null;
  const detail = rawDetail ? sanitizeToolDetail(rawDetail) : null;
  const kind: ProjectChatToolActivity['kind'] = /agent-kanban|kanban/.test(`${toolName} ${command ?? ''}`.toLowerCase())
    ? 'kanban'
    : /browser|web|https?:/.test(`${combined} ${command ?? ''}`) ? 'web'
      : /file|patch|edit|write/.test(combined) ? 'file'
        : /command|exec|shell/.test(combined) ? 'command' : 'tool';
  const labels = {
    kanban: 'Agent Kanban steuern',
    web: 'Web-Recherche',
    file: status === 'running' ? 'Datei bearbeiten' : 'Datei geprüft',
    command: status === 'running' ? 'Befehl ausführen' : 'Befehl abgeschlossen',
    tool: toolName ? `Tool: ${toolName}` : 'Tool verwenden',
  };
  return {
    id: stringValue(event.id) ?? stringValue(item.id) ?? stringValue(event.callId) ?? `${kind}-${toolName}-${detail ?? eventType}`.slice(0, 180),
    kind,
    label: labels[kind],
    detail,
    status,
  };
}

function sanitizeToolDetail(value: string) {
  return value
    .replace(/(ak_pat_[A-Za-z0-9_-]+)/g, '<redacted>')
    .replace(/(--?(?:token|password|secret|api[_-]?key)(?:=|\s+))\S+/gi, '$1<redacted>')
    .replace(/(authorization\s*:\s*bearer\s+)\S+/gi, '$1<redacted>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function newTextFragment(existing: string, candidate: string, full: boolean) {
  if (!candidate) return '';
  if (!full) return candidate;
  if (candidate === existing) return '';
  if (candidate.startsWith(existing)) return candidate.slice(existing.length);
  return existing.endsWith(candidate) ? '' : candidate;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    const content = asRecord(item);
    return content.type === 'text' ? stringValue(content.text) ?? '' : '';
  }).join('');
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  signal: AbortSignal,
  unitName: string,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      void stopSandboxUnit(unitName);
      cleanup();
      reject(new Error('chat_turn_cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('exit', (code, exitSignal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ code, signal: exitSignal });
    });
  });
}

export function stopSandboxUnit(unitName: string) {
  return new Promise<void>((resolve) => {
    const child = spawn('sudo', ['-n', 'systemctl', 'stop', unitName], { stdio: 'ignore' });
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
}

function sanitizeHarnessError(value: string) {
  return value
    .replace(/(?:api[_-]?key|token|authorization)\s*[:=]\s*\S+/gi, '[redacted]')
    .split('\n')
    .filter((line) => !/^Running as unit:|^Finished with result:|^Main processes terminated/.test(line))
    .join('\n')
    .trim()
    .slice(-2000);
}

function safeUnitPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chat';
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Error('chat_turn_cancelled');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length ? value : null;
}
