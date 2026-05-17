import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { HooksConfig, WorkspaceInfo } from './types';
import { runtimeLogger } from './logger';

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, '_');
}

export class WorkspaceManager {
  constructor(private readonly root: string, private readonly hooks: HooksConfig) {}

  async createForIssue(identifier: string): Promise<WorkspaceInfo> {
    const workspaceKey = sanitizeWorkspaceKey(identifier);
    const workspacePath = path.resolve(this.root, workspaceKey);
    assertInsideRoot(this.root, workspacePath);

    let createdNow = false;
    try {
      const current = await stat(workspacePath);
      if (!current.isDirectory()) {
        throw new Error(`Workspace path exists and is not a directory: ${workspacePath}`);
      }
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        await mkdir(workspacePath, { recursive: true });
        createdNow = true;
      } else {
        throw error;
      }
    }

    if (createdNow && this.hooks.afterCreate) {
      await runHook('after_create', this.hooks.afterCreate, workspacePath, this.hooks.timeoutMs, true);
    }

    return { path: workspacePath, workspaceKey, createdNow };
  }

  async beforeRun(workspacePath: string) {
    assertInsideRoot(this.root, workspacePath);
    if (this.hooks.beforeRun) {
      await runHook('before_run', this.hooks.beforeRun, workspacePath, this.hooks.timeoutMs, true);
    }
  }

  async afterRun(workspacePath: string) {
    assertInsideRoot(this.root, workspacePath);
    if (this.hooks.afterRun) {
      await runHook('after_run', this.hooks.afterRun, workspacePath, this.hooks.timeoutMs, false);
    }
  }

  async removeForIssue(identifier: string) {
    const workspacePath = path.resolve(this.root, sanitizeWorkspaceKey(identifier));
    assertInsideRoot(this.root, workspacePath);

    try {
      const current = await stat(workspacePath);
      if (!current.isDirectory()) return;
    } catch (error) {
      if (isMissingPathError(error)) return;
      throw error;
    }

    if (this.hooks.beforeRemove) {
      await runHook('before_remove', this.hooks.beforeRemove, workspacePath, this.hooks.timeoutMs, false);
    }
    await rm(workspacePath, { recursive: true, force: true });
  }
}

export function assertInsideRoot(root: string, workspacePath: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedWorkspace = path.resolve(workspacePath);
  const relative = path.relative(normalizedRoot, normalizedWorkspace);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Workspace path escapes root: ${normalizedWorkspace}`);
}

async function runHook(label: string, script: string, cwd: string, timeoutMs: number, fatal: boolean): Promise<void> {
  runtimeLogger.info('hook started', { hook: label, cwd });
  try {
    const result = await runShell(script, cwd, timeoutMs);
    if (result.exitCode !== 0) {
      throw new Error(`hook exited with code ${result.exitCode}: ${result.output}`);
    }
    runtimeLogger.info('hook completed', { hook: label, cwd });
  } catch (error) {
    runtimeLogger.warn('hook failed', { hook: label, cwd, error: error instanceof Error ? error.message : String(error) });
    if (fatal) throw error;
  }
}

function runShell(script: string, cwd: string, timeoutMs: number): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', script], {
      cwd,
      env: { ...process.env, SYMPHONY_WORKSPACE: cwd },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString('utf8')}`.slice(-4096);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output: output.trim() });
    });
  });
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
}
