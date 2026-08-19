import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  }).trim();
}

try {
  const branch = git(['branch', '--show-current']);
  if (!branch || branch === 'main' || branch === 'master') {
    throw new Error('Task is not on a dedicated branch yet.');
  }

  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error('Task branch still has uncommitted changes. Finish and commit the implementation.');
  }

  const commitsAhead = Number.parseInt(git(['rev-list', '--count', 'origin/master..HEAD']), 10);
  if (!Number.isFinite(commitsAhead) || commitsAhead < 1) {
    throw new Error('Task branch has no implementation commit ahead of origin/master. Continue the task and commit it.');
  }

  process.stdout.write(`Task branch is locally ready with ${commitsAhead} commit(s) ahead of origin/master.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
