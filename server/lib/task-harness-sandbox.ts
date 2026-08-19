import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { chmod, copyFile, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runtimeLogger } from './logger';
import type { AgentHarness } from './agent-harness';

export interface TaskHarnessSandboxOptions {
  unitName: string;
  executable: string;
  args: string[];
  workspacePath: string;
  sessionRoot: string;
  harness: AgentHarness;
}

export interface TaskHarnessRunner {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  unitName: string | null;
  browserSession: string;
}

export async function prepareTaskHarnessSession(sessionRoot: string) {
  const codexHome = path.join(sessionRoot, 'codex-home');
  const primeAgentHome = path.join(sessionRoot, 'prime-agent');
  await Promise.all([
    mkdir(sessionRoot, { recursive: true }),
    mkdir(path.join(sessionRoot, 'prime-sessions'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-data'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-state'), { recursive: true }),
    mkdir(path.join(sessionRoot, 'xdg-cache'), { recursive: true }),
    mkdir(codexHome, { recursive: true }),
    mkdir(primeAgentHome, { recursive: true, mode: 0o700 }),
  ]);

  const sourcePrimeAgentHome = path.join(os.homedir(), '.prime', 'agent');
  for (const name of ['auth.json', 'models.json', 'settings.json']) {
    const source = path.join(sourcePrimeAgentHome, name);
    const target = path.join(primeAgentHome, name);
    if (!fs.existsSync(source)) continue;
    await copyFile(source, target);
    await chmod(target, 0o600);
  }
  const taskPrimeSettingsPath = path.join(primeAgentHome, 'settings.json');
  let taskPrimeSettings: unknown = {};
  if (fs.existsSync(taskPrimeSettingsPath)) {
    try {
      taskPrimeSettings = JSON.parse(await readFile(taskPrimeSettingsPath, 'utf8'));
    } catch {
      taskPrimeSettings = {};
    }
  }
  await writeFile(
    taskPrimeSettingsPath,
    `${JSON.stringify(primeTaskSettings(taskPrimeSettings), null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(taskPrimeSettingsPath, 0o600);

  const sourceCodexHome = path.join(os.homedir(), '.codex');
  for (const name of ['auth.json', 'config.toml', 'plugins']) {
    const source = path.join(sourceCodexHome, name);
    const target = path.join(codexHome, name);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    await symlink(source, target, fs.statSync(source).isDirectory() ? 'dir' : 'file').catch(() => undefined);
  }
  const sourceSkills = path.join(sourceCodexHome, 'skills');
  const targetSkills = path.join(codexHome, 'skills');
  await mkdir(targetSkills, { recursive: true });
  if (fs.existsSync(sourceSkills)) {
    for (const entry of await readdir(sourceSkills, { withFileTypes: true })) {
      const target = path.join(targetSkills, entry.name);
      if (fs.existsSync(target)) continue;
      await symlink(path.join(sourceSkills, entry.name), target, entry.isDirectory() ? 'dir' : 'file').catch(() => undefined);
    }
  }
}

export function primeTaskSettings(value: unknown) {
  const settings = recordValue(value);
  const compaction = recordValue(settings.compaction);
  return {
    ...settings,
    compaction: {
      ...compaction,
      enabled: true,
    },
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildTaskHarnessRunner(options: TaskHarnessSandboxOptions): TaskHarnessRunner {
  assertTaskUnitName(options.unitName);
  const home = os.homedir();
  const browserSession = taskHarnessBrowserSession(options.sessionRoot);
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CODEX_HOME: path.join(options.sessionRoot, 'codex-home'),
    PRIME_AGENT_CODING_AGENT_DIR: path.join(options.sessionRoot, 'prime-agent'),
    XDG_DATA_HOME: path.join(options.sessionRoot, 'xdg-data'),
    XDG_STATE_HOME: path.join(options.sessionRoot, 'xdg-state'),
    XDG_CACHE_HOME: path.join(options.sessionRoot, 'xdg-cache'),
    AGENT_BROWSER_SESSION: browserSession,
  };

  if (process.env.KANBAN_TASK_DISABLE_SYSTEMD_SANDBOX === '1') {
    return { command: options.executable, args: options.args, env, unitName: null, browserSession };
  }

  const properties = [
    'ReadOnlyPaths=/',
    'ProtectHome=read-only',
    `ReadWritePaths=${options.sessionRoot}`,
    `ReadWritePaths=${options.workspacePath}`,
    'NoNewPrivileges=yes',
    'RestrictSUIDSGID=yes',
    'PrivateDevices=yes',
    'PrivateTmp=yes',
    'KillMode=control-group',
    ...taskHarnessResourceProperties(),
  ];
  const gitCommonDirectory = resolveGitCommonDirectory(options.workspacePath);
  if (gitCommonDirectory) properties.push(`ReadWritePaths=${gitCommonDirectory}`);
  const browserHome = path.join(home, '.agent-browser');
  if (fs.existsSync(browserHome)) properties.push(`ReadWritePaths=${browserHome}`);

  return {
    command: 'sudo',
    env,
    unitName: options.unitName,
    browserSession,
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
      `--setenv=CODEX_HOME=${env.CODEX_HOME}`,
      `--setenv=PRIME_AGENT_CODING_AGENT_DIR=${env.PRIME_AGENT_CODING_AGENT_DIR}`,
      `--setenv=XDG_DATA_HOME=${env.XDG_DATA_HOME}`,
      `--setenv=XDG_STATE_HOME=${env.XDG_STATE_HOME}`,
      `--setenv=XDG_CACHE_HOME=${env.XDG_CACHE_HOME}`,
      `--setenv=AGENT_BROWSER_SESSION=${browserSession}`,
      ...properties.map((property) => `--property=${property}`),
      '--',
      options.executable,
      ...options.args,
    ],
  };
}

export function taskHarnessResourceProperties(env: NodeJS.ProcessEnv = process.env) {
  const memoryHighMb = boundedResourceLimit(env.KANBAN_TASK_MEMORY_HIGH_MB, 2_048, 256, 32_768);
  const requestedMemoryMaxMb = boundedResourceLimit(env.KANBAN_TASK_MEMORY_MAX_MB, 3_072, 512, 65_536);
  const memoryMaxMb = Math.max(memoryHighMb, requestedMemoryMaxMb);
  const tasksMax = boundedResourceLimit(env.KANBAN_TASK_MAX_PROCESSES, 1_024, 64, 16_384);
  return [
    `MemoryHigh=${memoryHighMb}M`,
    `MemoryMax=${memoryMaxMb}M`,
    `TasksMax=${tasksMax}`,
    'OOMPolicy=stop',
  ];
}

function boundedResourceLimit(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export async function stopTaskHarnessUnit(unitName: string | null | undefined) {
  if (!unitName) return;
  assertTaskUnitName(unitName);
  await runSystemctl(['kill', '--kill-whom=all', '--signal=SIGTERM', unitName]);
  const active = await systemctlIsActive(unitName);
  if (active) {
    await runSystemctl(['kill', '--kill-whom=all', '--signal=SIGKILL', unitName]);
  }
  await runSystemctl(['stop', unitName]);
}

export function taskHarnessBrowserSession(sessionRoot: string) {
  return `task-${safeUnitPart(path.basename(sessionRoot)).slice(-48)}`;
}

export async function closeTaskBrowserSession(browserSession: string | null | undefined) {
  if (!browserSession || !/^task-[a-z0-9-]+$/.test(browserSession)) return;
  await runProcess('agent-browser', ['close', '--session', browserSession], 10_000);
}

export async function cleanupTaskHarnessSession(sessionRoot: string) {
  const resolved = path.resolve(sessionRoot);
  const marker = `${path.sep}task-sessions${path.sep}`;
  const suffix = resolved.includes(marker) ? resolved.split(marker).at(-1) ?? '' : '';
  if (suffix.split(path.sep).filter(Boolean).length < 3) throw new Error('invalid_task_harness_session_root');
  await rm(resolved, { recursive: true, force: true });
}

export async function listTaskHarnessUnits() {
  return new Promise<string[]>((resolve) => {
    const child = spawn('systemctl', [
      'list-units',
      '--all',
      '--plain',
      '--no-legend',
      'agent-kanban-task-*.service',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.once('error', () => resolve([]));
    child.once('exit', () => resolve(stdout.split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((unit) => unit.startsWith('agent-kanban-task-'))
      .map((unit) => unit.replace(/\.service$/, ''))));
  });
}

export function taskHarnessUnitName(taskId: string, runId: string, attempt: number) {
  return `agent-kanban-task-${safeUnitPart(taskId).slice(0, 12)}-${safeUnitPart(runId).slice(0, 12)}-${attempt}-${Date.now().toString(36)}`;
}

function systemctlIsActive(unitName: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn('systemctl', ['is-active', '--quiet', unitName], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 5_000);
    timer.unref();
    child.once('error', () => resolve(false));
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function runSystemctl(args: string[]) {
  return runProcess('sudo', ['-n', 'systemctl', ...args], 10_000);
}

function runProcess(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const child = spawn(command, args, { stdio: 'ignore' });
    const finish = (failure: { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (failure.timedOut || failure.code !== 0) {
        warnHelperFailure(command, failure);
      }
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: child.exitCode, signal: child.signalCode, timedOut: true });
    }, timeoutMs);
    timer.unref();
    child.once('error', () => finish({ code: null, signal: null, timedOut: false }));
    child.once('exit', (code, signal) => finish({ code, signal, timedOut: false }));
  });
}

const helperWarnCooldown = new Map<string, number>();
const HELPER_WARN_COOLDOWN_MS = 60_000;

function warnHelperFailure(command: string, failure: { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }) {
  const key = `${command}:${failure.timedOut ? 'timeout' : `code=${failure.code}`}`;
  const last = helperWarnCooldown.get(key) ?? 0;
  const now = Date.now();
  if (now - last < HELPER_WARN_COOLDOWN_MS) return;
  helperWarnCooldown.set(key, now);
  runtimeLogger.warn('task harness helper process failed', {
    command,
    code: failure.code,
    signal: failure.signal,
    timed_out: failure.timedOut,
  });
}

function assertTaskUnitName(unitName: string) {
  if (!/^agent-kanban-task-[a-z0-9-]+$/.test(unitName)) throw new Error('invalid_task_harness_unit');
}

function resolveGitCommonDirectory(workspacePath: string) {
  try {
    const value = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: workspacePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
    return value ? path.resolve(value) : null;
  } catch {
    return null;
  }
}

function safeUnitPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
}
