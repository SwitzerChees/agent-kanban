import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, stat, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GIT_TIMEOUT_MS = 120_000;
const GIT_OUTPUT_LIMIT = 4 * 1024 * 1024;
const repositoryLocks = new Map<string, Promise<void>>();

export interface RefinementWorkspaceSync {
  gitRoot: string;
  projectPath: string;
  branchName: 'master';
  revision: string;
  dirty: boolean;
  pullOutput: string;
}

export interface TaskWorktree {
  gitRoot: string;
  worktreeRoot: string;
  projectPath: string;
  branchName: string;
  revision: string;
  createdNow: boolean;
  recoveryRef: string | null;
}

export class GitWorkspaceError extends Error {
  constructor(
    public readonly code: 'refinement_master_sync_failed' | 'task_worktree_prepare_failed' | 'task_worktree_cleanup_failed',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GitWorkspaceError';
  }
}

export interface TaskWorktreeCleanup {
  removed: boolean;
  branchName: string | null;
  reason: 'removed' | 'missing' | 'dirty';
}

/**
 * Updates the configured main workspace in place immediately before a
 * read-only refinement. Local changes are preserved; Git itself rejects a
 * pull when they conflict with the incoming fast-forward.
 */
export async function syncMasterForRefinement(
  projectPath: string,
  signal?: AbortSignal,
): Promise<RefinementWorkspaceSync> {
  let repository: Awaited<ReturnType<typeof resolveRepository>>;
  try {
    repository = await resolveRepository(projectPath, signal);
  } catch (error) {
    throw refinementSyncError('The project folder is not a readable Git working tree.', error);
  }

  return withRepositoryLock(repository.gitRoot, async () => {
    try {
      const branchName = (await runGit(['branch', '--show-current'], repository.gitRoot, signal)).trim();
      if (branchName !== 'master') {
        throw new Error(`refinement_requires_master_branch:${branchName || 'detached'}`);
      }

      const pullOutput = await runGit(['pull', '--ff-only', 'origin', 'master'], repository.gitRoot, signal);
      const confirmedBranch = (await runGit(['branch', '--show-current'], repository.gitRoot, signal)).trim();
      if (confirmedBranch !== 'master') throw new Error('refinement_master_branch_changed_during_pull');

      const revision = (await runGit(['rev-parse', 'HEAD'], repository.gitRoot, signal)).trim();
      const dirty = Boolean((await runGit(['status', '--porcelain'], repository.gitRoot, signal)).trim());
      if (!revision) throw new Error('refinement_master_revision_missing');
      return {
        ...repository,
        branchName: 'master' as const,
        revision: `${revision}${dirty ? '-dirty' : ''}`,
        dirty,
        pullOutput: pullOutput.trim(),
      };
    } catch (error) {
      if (error instanceof GitWorkspaceError) throw error;
      throw refinementSyncError('Could not fast-forward the project master branch from origin/master.', error);
    }
  });
}

/**
 * Creates one persistent worktree and dedicated branch per AI task. Repeated
 * executions of the same task reuse the existing tree so follow-up work and
 * uncommitted context are not lost.
 */
export async function prepareTaskWorktree(input: {
  projectPath: string;
  worktreePath: string;
  taskId: string;
  taskKey: string;
  signal?: AbortSignal;
}): Promise<TaskWorktree> {
  let repository: Awaited<ReturnType<typeof resolveRepository>>;
  try {
    repository = await resolveRepository(input.projectPath, input.signal);
  } catch (error) {
    throw taskWorktreeError('The project folder is not a readable Git working tree.', error);
  }

  const worktreeRoot = path.resolve(input.worktreePath);
  const branchName = taskWorktreeBranch(input.taskKey, input.taskId);
  return withRepositoryLock(repository.gitRoot, async () => {
    if (await pathExists(worktreeRoot)) {
      try {
        const worktree = await validateExistingTaskWorktree(repository, worktreeRoot, input.signal);
        const recoveryRef = await createDirtyWorktreeRecoveryRef(worktree, input.taskId, input.signal);
        return { ...worktree, recoveryRef };
      } catch (error) {
        throw taskWorktreeError(`Could not preserve and reuse the isolated worktree for ${input.taskKey}.`, error);
      }
    }

    try {
      await runGit(['worktree', 'prune'], repository.gitRoot, input.signal);
      await runGit(['fetch', '--prune', 'origin', 'master'], repository.gitRoot, input.signal);
      await mkdir(path.dirname(worktreeRoot), { recursive: true });
      const branchExists = await gitSucceeds(
        ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
        repository.gitRoot,
        input.signal,
      );
      const addArgs = branchExists
        ? ['worktree', 'add', worktreeRoot, branchName]
        : ['worktree', 'add', '-b', branchName, worktreeRoot, 'origin/master'];
      await runGit(addArgs, repository.gitRoot, input.signal);
      const worktree = await validateExistingTaskWorktree(repository, worktreeRoot, input.signal);
      return { ...worktree, createdNow: true, recoveryRef: null };
    } catch (error) {
      await runGit(['worktree', 'remove', '--force', worktreeRoot], repository.gitRoot).catch(() => undefined);
      await rm(worktreeRoot, { recursive: true, force: true }).catch(() => undefined);
      throw taskWorktreeError(`Could not prepare the isolated worktree for ${input.taskKey}.`, error);
    }
  });
}

export function taskWorktreeBranch(taskKey: string, taskId: string) {
  const key = taskKey.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '') || 'task';
  const id = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'work';
  return `codex/${`${key}-${id}`.slice(0, 180)}`;
}

/**
 * Removes a completed task's clean worktree while deliberately retaining the
 * local branch as a recovery point. Dirty trees are never force-removed.
 */
export async function removeTaskWorktree(input: {
  projectPath: string;
  worktreePath: string;
  signal?: AbortSignal;
}): Promise<TaskWorktreeCleanup> {
  let repository: Awaited<ReturnType<typeof resolveRepository>>;
  try {
    repository = await resolveRepository(input.projectPath, input.signal);
  } catch (error) {
    throw taskWorktreeCleanupError('The project folder is not a readable Git working tree.', error);
  }

  const worktreeRoot = path.resolve(input.worktreePath);
  return withRepositoryLock(repository.gitRoot, async () => {
    if (!await pathExists(worktreeRoot)) {
      return { removed: false, branchName: null, reason: 'missing' };
    }
    try {
      const worktree = await validateExistingTaskWorktree(repository, worktreeRoot, input.signal);
      const dirty = Boolean((await runGit(['status', '--porcelain'], worktreeRoot, input.signal)).trim());
      if (dirty) {
        return { removed: false, branchName: worktree.branchName, reason: 'dirty' };
      }
      await runGit(['worktree', 'remove', worktreeRoot], repository.gitRoot, input.signal);
      await runGit(['worktree', 'prune'], repository.gitRoot, input.signal);
      return { removed: true, branchName: worktree.branchName, reason: 'removed' };
    } catch (error) {
      throw taskWorktreeCleanupError('Could not remove the completed task worktree.', error);
    }
  });
}

async function validateExistingTaskWorktree(
  repository: Awaited<ReturnType<typeof resolveRepository>>,
  worktreeRoot: string,
  signal?: AbortSignal,
): Promise<TaskWorktree> {
  try {
    const commonDirOutput = (await runGit(['rev-parse', '--git-common-dir'], worktreeRoot, signal)).trim();
    const worktreeCommonDir = await realpath(path.resolve(worktreeRoot, commonDirOutput));
    const mainCommonDirOutput = (await runGit(['rev-parse', '--git-common-dir'], repository.gitRoot, signal)).trim();
    const mainCommonDir = await realpath(path.resolve(repository.gitRoot, mainCommonDirOutput));
    if (worktreeCommonDir !== mainCommonDir) throw new Error('task_worktree_repository_mismatch');

    const branchName = (await runGit(['branch', '--show-current'], worktreeRoot, signal)).trim();
    if (!branchName) throw new Error('task_worktree_detached');
    if (branchName === 'master') throw new Error('task_worktree_uses_master');
    const revision = (await runGit(['rev-parse', 'HEAD'], worktreeRoot, signal)).trim();
    const projectPath = path.join(worktreeRoot, repository.projectRelativePath);
    const projectStats = await stat(projectPath);
    if (!projectStats.isDirectory()) throw new Error('task_worktree_project_path_missing');
    return {
      gitRoot: repository.gitRoot,
      worktreeRoot,
      projectPath,
      branchName,
      revision,
      createdNow: false,
      recoveryRef: null,
    };
  } catch (error) {
    throw taskWorktreeError('The existing task worktree is invalid.', error);
  }
}

async function createDirtyWorktreeRecoveryRef(
  worktree: TaskWorktree,
  taskId: string,
  signal?: AbortSignal,
) {
  const status = (await runGit(['status', '--porcelain=v1', '-uall'], worktree.worktreeRoot, signal)).trim();
  if (!status) return null;

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'agent-kanban-recovery-index-'));
  const temporaryIndex = path.join(temporaryDirectory, 'index');
  const indexEnvironment = {
    GIT_INDEX_FILE: temporaryIndex,
    GIT_AUTHOR_NAME: 'Agent Kanban Recovery',
    GIT_AUTHOR_EMAIL: 'recovery@agent-kanban.local',
    GIT_COMMITTER_NAME: 'Agent Kanban Recovery',
    GIT_COMMITTER_EMAIL: 'recovery@agent-kanban.local',
  };
  try {
    await runGit(['read-tree', 'HEAD'], worktree.worktreeRoot, signal, indexEnvironment);
    await runGit(['add', '-A', '--', '.'], worktree.worktreeRoot, signal, indexEnvironment);
    const tree = (await runGit(['write-tree'], worktree.worktreeRoot, signal, indexEnvironment)).trim();
    const parent = (await runGit(['rev-parse', 'HEAD'], worktree.worktreeRoot, signal)).trim();
    const commit = (await runGit([
      'commit-tree',
      tree,
      '-p',
      parent,
      '-m',
      `Agent Kanban recovery snapshot for ${taskId}`,
    ], worktree.worktreeRoot, signal, indexEnvironment)).trim();
    const safeTaskId = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32) || 'task';
    const recoveryRef = `refs/agent-kanban/recovery/${safeTaskId}/latest`;
    await runGit(['update-ref', recoveryRef, commit], worktree.gitRoot, signal);
    return recoveryRef;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function resolveRepository(projectPath: string, signal?: AbortSignal) {
  const resolvedProjectPath = await realpath(path.resolve(projectPath));
  const gitRootOutput = (await runGit(['rev-parse', '--show-toplevel'], resolvedProjectPath, signal)).trim();
  const gitRoot = await realpath(gitRootOutput);
  const projectRelativePath = path.relative(gitRoot, resolvedProjectPath);
  if (projectRelativePath === '..' || projectRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(projectRelativePath)) {
    throw new Error('project_path_outside_git_root');
  }
  return { gitRoot, projectPath: resolvedProjectPath, projectRelativePath };
}

async function withRepositoryLock<T>(gitRoot: string, action: () => Promise<T>): Promise<T> {
  const previous = repositoryLocks.get(gitRoot) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  repositoryLocks.set(gitRoot, current);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (repositoryLocks.get(gitRoot) === current) repositoryLocks.delete(gitRoot);
  }
}

function runGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  environment: NodeJS.ProcessEnv = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: GIT_OUTPUT_LIMIT,
      timeout: GIT_TIMEOUT_MS,
      signal,
      env: {
        ...process.env,
        ...environment,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '1',
      },
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      const detail = `${stderr || stdout}`.trim().slice(-4000);
      reject(new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`, { cause: error }));
    });
  });
}

async function gitSucceeds(args: string[], cwd: string, signal?: AbortSignal) {
  try {
    await runGit(args, cwd, signal);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(value: string) {
  try {
    await stat(value);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function refinementSyncError(message: string, cause: unknown) {
  return new GitWorkspaceError('refinement_master_sync_failed', `${message} ${errorMessage(cause)}`.trim(), { cause });
}

function taskWorktreeError(message: string, cause: unknown) {
  if (cause instanceof GitWorkspaceError && cause.code === 'task_worktree_prepare_failed') return cause;
  return new GitWorkspaceError('task_worktree_prepare_failed', `${message} ${errorMessage(cause)}`.trim(), { cause });
}

function taskWorktreeCleanupError(message: string, cause: unknown) {
  if (cause instanceof GitWorkspaceError && cause.code === 'task_worktree_cleanup_failed') return cause;
  return new GitWorkspaceError('task_worktree_cleanup_failed', `${message} ${errorMessage(cause)}`.trim(), { cause });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? '');
}
