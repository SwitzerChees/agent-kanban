import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  prepareTaskWorktree,
  removeTaskWorktree,
  syncMasterForRefinement,
  taskWorktreeBranch,
} from '../server/lib/git-workspaces';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-git-workspaces-'));

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('Git workspace isolation', () => {
  test('fast-forwards the main master before refinement while preserving non-conflicting local context', async () => {
    const repository = createRepository('refinement');
    commitAndPush(repository.seed, 'remote.txt', 'latest master\n', 'remote update');

    const firstSync = await syncMasterForRefinement(repository.main);
    expect(firstSync).toMatchObject({ branchName: 'master', dirty: false });
    expect(readFileSync(path.join(repository.main, 'remote.txt'), 'utf8')).toBe('latest master\n');
    expect(firstSync.revision).toBe(git(repository.main, ['rev-parse', 'HEAD']));

    writeFileSync(path.join(repository.main, 'local-notes.txt'), 'local context\n');
    commitAndPush(repository.seed, 'second-remote.txt', 'newer master\n', 'second remote update');
    const dirtySync = await syncMasterForRefinement(repository.main);
    expect(dirtySync.dirty).toBe(true);
    expect(dirtySync.revision).toBe(`${git(repository.main, ['rev-parse', 'HEAD'])}-dirty`);
    expect(readFileSync(path.join(repository.main, 'local-notes.txt'), 'utf8')).toBe('local context\n');
    expect(readFileSync(path.join(repository.main, 'second-remote.txt'), 'utf8')).toBe('newer master\n');
  });

  test('rejects refinement outside the main master branch', async () => {
    const repository = createRepository('wrong-branch');
    git(repository.main, ['switch', '-c', 'feature/local']);

    await expect(syncMasterForRefinement(repository.main)).rejects.toMatchObject({
      code: 'refinement_master_sync_failed',
    });
  });

  test('creates and reuses one isolated codex worktree per AI task', async () => {
    const repository = createRepository('tasks');
    commitAndPush(repository.seed, 'remote.txt', 'task base\n', 'task base update');
    const firstPath = path.join(repository.root, 'worktrees', 'task-one');
    const secondPath = path.join(repository.root, 'worktrees', 'task-two');

    const first = await prepareTaskWorktree({
      projectPath: repository.main,
      worktreePath: firstPath,
      taskId: '11111111-aaaa-bbbb-cccc-111111111111',
      taskKey: 'PROJ-1',
    });
    expect(first).toMatchObject({
      worktreeRoot: firstPath,
      branchName: taskWorktreeBranch('PROJ-1', '11111111-aaaa-bbbb-cccc-111111111111'),
      createdNow: true,
    });
    expect(readFileSync(path.join(first.projectPath, 'remote.txt'), 'utf8')).toBe('task base\n');
    writeFileSync(path.join(first.projectPath, 'task-one.txt'), 'keep this work\n');

    const second = await prepareTaskWorktree({
      projectPath: repository.main,
      worktreePath: secondPath,
      taskId: '22222222-aaaa-bbbb-cccc-222222222222',
      taskKey: 'PROJ-2',
    });
    expect(second.branchName).not.toBe(first.branchName);
    expect(second.worktreeRoot).not.toBe(first.worktreeRoot);
    expect(git(second.worktreeRoot, ['status', '--porcelain'])).toBe('');

    git(first.worktreeRoot, ['switch', '-c', 'codex/proj-1-follow-up-fix']);
    const reused = await prepareTaskWorktree({
      projectPath: repository.main,
      worktreePath: firstPath,
      taskId: '11111111-aaaa-bbbb-cccc-111111111111',
      taskKey: 'PROJ-1',
    });
    expect(reused.createdNow).toBe(false);
    expect(reused.worktreeRoot).toBe(first.worktreeRoot);
    expect(reused.branchName).toBe('codex/proj-1-follow-up-fix');
    expect(readFileSync(path.join(reused.projectPath, 'task-one.txt'), 'utf8')).toBe('keep this work\n');
    expect(git(repository.main, ['status', '--porcelain'])).toBe('');

    await expect(removeTaskWorktree({
      projectPath: repository.main,
      worktreePath: firstPath,
    })).resolves.toMatchObject({ removed: false, reason: 'dirty' });
    expect(existsSync(firstPath)).toBe(true);

    git(first.worktreeRoot, ['add', 'task-one.txt']);
    git(first.worktreeRoot, ['commit', '-m', 'finish task one']);
    await expect(removeTaskWorktree({
      projectPath: repository.main,
      worktreePath: firstPath,
    })).resolves.toMatchObject({
      removed: true,
      branchName: 'codex/proj-1-follow-up-fix',
      reason: 'removed',
    });
    expect(existsSync(firstPath)).toBe(false);
  });
});

function createRepository(name: string) {
  const root = path.join(testRoot, name);
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const main = path.join(root, 'main');
  git(testRoot, ['init', '--bare', '-b', 'master', remote]);
  git(testRoot, ['init', '-b', 'master', seed]);
  configureUser(seed);
  writeFileSync(path.join(seed, 'README.md'), '# Test repository\n');
  git(seed, ['add', 'README.md']);
  git(seed, ['commit', '-m', 'initial']);
  git(seed, ['remote', 'add', 'origin', remote]);
  git(seed, ['push', '-u', 'origin', 'master']);
  git(root, ['clone', remote, main]);
  configureUser(main);
  return { root, remote, seed, main };
}

function commitAndPush(repository: string, fileName: string, content: string, message: string) {
  writeFileSync(path.join(repository, fileName), content);
  git(repository, ['add', fileName]);
  git(repository, ['commit', '-m', message]);
  git(repository, ['push', 'origin', 'master']);
}

function configureUser(repository: string) {
  git(repository, ['config', 'user.email', 'agent-kanban-tests@example.com']);
  git(repository, ['config', 'user.name', 'Agent Kanban Tests']);
}

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
