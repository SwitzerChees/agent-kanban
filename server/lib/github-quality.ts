import { execFile } from 'node:child_process';
import type { ProjectQuality } from './project-quality';

export interface CommandResult { ok: boolean; stdout: string; stderr: string }
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<CommandResult>;
export const runQualityCommand: CommandRunner = (command, args, cwd) => new Promise(resolve => {
  execFile(command, args, { cwd, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ ok: !error, stdout: stdout.toString(), stderr: stderr.toString() });
  });
});

export interface GitHubWaitTarget {
  kind: 'ci' | 'deployment';
  workflow: string;
  commit: string;
  branch: string;
  pullRequest: number;
  createdAt: string;
}
export interface WorkflowEvidence {
  status: 'pending' | 'success' | 'failure' | 'unknown';
  runId?: number;
  commit?: string;
  url?: string;
  conclusion?: string;
  completedAt?: string;
}
interface WorkflowRun {
  databaseId: number; headSha: string; status: string; conclusion: string;
  url: string; updatedAt: string;
}
export async function qualityJson<T>(args: string[], cwd: string, run = runQualityCommand): Promise<T | null> {
  const result = await run('gh', args, cwd);
  if (!result.ok) return null;
  try { return JSON.parse(result.stdout) as T; } catch { return null; }
}

export async function captureGitHubWait(kind: string, cwd: string, policy: ProjectQuality | null, run = runQualityCommand): Promise<GitHubWaitTarget | null> {
  const workflow = kind === 'ci' ? policy?.ciWorkflow : kind === 'deployment' ? policy?.deploymentWorkflow : null;
  if (!workflow) return null;
  const pr = await qualityJson<{ number: number; headRefOid: string; mergeCommit: { oid: string } | null }>(
    ['pr', 'view', '--json', 'number,headRefOid,mergeCommit'], cwd, run,
  );
  const commit = kind === 'ci' ? pr?.headRefOid : pr?.mergeCommit?.oid;
  if (!pr || !commit || !/^[a-f0-9]{40}$/.test(commit)) return null;
  return { kind: kind as GitHubWaitTarget['kind'], workflow, commit, branch: policy!.deploymentBranch, pullRequest: pr.number, createdAt: new Date().toISOString() };
}

export async function probeGitHubWait(target: GitHubWaitTarget, cwd: string, run = runQualityCommand): Promise<WorkflowEvidence> {
  // Never treat results from an obsolete PR head as results for a newer push.
  if (target.kind === 'ci') {
    const pr = await qualityJson<{ headRefOid: string }>(['pr', 'view', String(target.pullRequest), '--json', 'headRefOid'], cwd, run);
    if (!pr) return { status: 'unknown' };
    if (pr.headRefOid !== target.commit) return { status: 'failure', conclusion: 'head_changed' };
  }
  const args = ['run', 'list', '--workflow', target.workflow, '--limit', '20', '--json', 'databaseId,headSha,status,conclusion,url,updatedAt'];
  if (target.kind === 'ci') args.push('--commit', target.commit, '--event', 'pull_request');
  else args.push('--branch', target.branch, '--event', 'push');
  const runs = await qualityJson<WorkflowRun[]>(args, cwd, run);
  if (!Array.isArray(runs)) return { status: 'unknown' };
  // A rerun updates an existing run, so creation order alone can hide a newer failure.
  runs.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  let candidate = target.kind === 'ci' ? runs.find(item => item.headSha === target.commit) : runs[0];
  // Only the latest deployment may prove what is serving now. Never fall back
  // to an older green run after a rollback or a newer failed deployment.
  if (candidate && target.kind === 'deployment' && candidate.headSha !== target.commit) {
    const repo = await qualityJson<{ nameWithOwner: string }>(['repo', 'view', '--json', 'nameWithOwner'], cwd, run);
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo.nameWithOwner) || !/^[a-f0-9]{40}$/.test(candidate.headSha)) return { status: 'unknown' };
    const comparison = await qualityJson<{ status: string }>(['api', `repos/${repo.nameWithOwner}/compare/${target.commit}...${candidate.headSha}`], cwd, run);
    if (!comparison) return { status: 'unknown' };
    if (comparison.status !== 'ahead' && comparison.status !== 'identical') candidate = undefined;
  }
  if (!candidate) return { status: 'pending' };
  return {
    status: candidate.status !== 'completed' ? 'pending' : candidate.conclusion === 'success' ? 'success' : 'failure',
    runId: candidate.databaseId, commit: candidate.headSha, url: candidate.url,
    conclusion: candidate.conclusion, completedAt: candidate.status === 'completed' ? candidate.updatedAt : undefined,
  };
}
