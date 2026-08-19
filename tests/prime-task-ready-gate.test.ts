import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { checkPrimeTaskReady } from '../server/lib/external-agent';

const gatePath = path.resolve(process.cwd(), 'server', 'prime-gates', 'task-ready.mjs');
let repositoryPath = '';

describe('Prime autonomous task-ready gate', () => {
  beforeAll(() => {
    repositoryPath = mkdtempSync(path.join(os.tmpdir(), 'prime-task-gate-'));
    git(['init', '-q']);
    git(['config', 'user.name', 'Agent Kanban Test']);
    git(['config', 'user.email', 'agent-kanban@example.invalid']);
    writeFileSync(path.join(repositoryPath, 'README.md'), 'base\n');
    git(['add', 'README.md']);
    git(['commit', '-q', '-m', 'base']);
    git(['branch', '-M', 'master']);
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    git(['switch', '-q', '-c', 'codex/task-ready-test']);
  });

  afterAll(() => {
    rmSync(repositoryPath, { recursive: true, force: true });
  });

  test('requires a clean implementation commit ahead of origin/master', () => {
    const noCommit = runGate();
    expect(noCommit.status).toBe(1);
    expect(noCommit.stderr).toContain('no implementation commit');

    writeFileSync(path.join(repositoryPath, 'feature.txt'), 'implemented\n');
    git(['add', 'feature.txt']);
    git(['commit', '-q', '-m', 'implement task']);
    const ready = runGate();
    expect(ready.status).toBe(0);
    expect(ready.stdout).toContain('1 commit(s) ahead');

    writeFileSync(path.join(repositoryPath, 'feature.txt'), 'dirty\n');
    const dirty = runGate();
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain('uncommitted changes');
  });

  test('returns an actionable staged host-gate result', async () => {
    git(['restore', 'feature.txt']);
    expect(await checkPrimeTaskReady(repositoryPath)).toMatchObject({
      ok: true,
      metadata: { stage: 'implementation', workspacePath: repositoryPath },
    });

    writeFileSync(path.join(repositoryPath, 'feature.txt'), 'dirty again\n');
    const blocked = await checkPrimeTaskReady(repositoryPath);
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain('uncommitted changes');
    expect(blocked.prompt).toContain('Preserve and inspect all existing task-worktree changes');
  });
});

function git(args: string[]) {
  return execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runGate() {
  const result = spawnSync(process.execPath, [gatePath], {
    cwd: repositoryPath,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
