import { describe, expect, it } from 'vitest';
import { captureGitHubWait, probeGitHubWait, type CommandRunner, type GitHubWaitTarget } from '../server/lib/github-quality';
import { checkAgentsCompletionGate } from '../server/lib/completion-gate';
import { projectQualitySchema } from '../server/lib/project-quality';
import { completedBrowserEvidence } from '../server/lib/browser-evidence';

const head = 'a'.repeat(40);
const merge = 'b'.repeat(40);
const next = 'c'.repeat(40);
const policy = projectQualitySchema.parse({ version: 1, ciWorkflow: 'ci.yml', deploymentWorkflow: 'cd-test.yml' });
const pr = { number: 7, headRefOid: head, state: 'MERGED', mergedAt: '2026-09-10T00:00:00Z', mergeCommit: { oid: merge } };
const target: GitHubWaitTarget = { kind: 'ci', workflow: 'ci.yml', commit: head, branch: 'master', pullRequest: 7, createdAt: new Date().toISOString() };
const workflow = (commit = head, conclusion = 'success', status = 'completed') => ({ databaseId: 42, headSha: commit, conclusion, status, url: 'https://github.com/a/b/actions/runs/42', updatedAt: '2026-09-10T00:00:00Z' });
function runner(options: { ci?: unknown; deployment?: unknown; head?: string; comparison?: string; localHead?: string } = {}): CommandRunner {
  return async (command, args) => {
    let value: unknown;
    if (command === 'git') return { ok: true, stdout: args[0] === 'status' ? '' : args[0] === 'branch' ? 'codex/task' : args[1] === 'HEAD' ? options.localHead ?? head : '/repo', stderr: '' };
    if (args[0] === 'pr') value = { ...pr, headRefOid: options.head ?? head };
    if (args[0] === 'run') value = args.includes('ci.yml') ? options.ci ?? [workflow()] : options.deployment ?? [workflow(merge)];
    if (args[0] === 'repo') value = { nameWithOwner: 'a/b' };
    if (args[0] === 'api') value = { status: options.comparison ?? 'ahead' };
    return { ok: true, stdout: JSON.stringify(value), stderr: '' };
  };
}
describe('commit-bound GitHub quality', () => {
  it('captures the PR head for CI and the merge commit for TEST', async () => {
    expect(await captureGitHubWait('ci', '/repo', policy, runner())).toMatchObject({ commit: head, workflow: 'ci.yml', pullRequest: 7 });
    expect(await captureGitHubWait('deployment', '/repo', policy, runner())).toMatchObject({ commit: merge, workflow: 'cd-test.yml' });
    expect(await captureGitHubWait('rate_limit', '/repo', policy, runner())).toBeNull();
  });
  it.each(['failure', 'cancelled', 'skipped', 'timed_out'])('wakes for %s without calling it successful', async conclusion => {
    expect(await probeGitHubWait(target, '/repo', runner({ ci: [workflow(head, conclusion)] }))).toMatchObject({ status: 'failure', conclusion });
  });
  it('keeps pending or not-yet-created workflows parked', async () => {
    expect(await probeGitHubWait(target, '/repo', runner({ ci: [] }))).toEqual({ status: 'pending' });
    expect(await probeGitHubWait(target, '/repo', runner({ ci: [workflow(head, '', 'in_progress')] }))).toMatchObject({ status: 'pending' });
  });
  it('never accepts an obsolete PR head or another commit', async () => {
    expect(await probeGitHubWait(target, '/repo', runner({ head: next }))).toMatchObject({ status: 'failure', conclusion: 'head_changed' });
    expect(await probeGitHubWait(target, '/repo', runner({ ci: [workflow(next)] }))).toEqual({ status: 'pending' });
  });
  it('does not silently pass when GitHub is unavailable', async () => {
    expect(await probeGitHubWait(target, '/repo', async () => ({ ok: false, stdout: '', stderr: 'unavailable' }))).toEqual({ status: 'unknown' });
  });
  it('accepts a coalesced deployment only after proving ancestry', async () => {
    const deployment = { ...target, kind: 'deployment' as const, commit: merge, workflow: 'cd-test.yml' };
    expect(await probeGitHubWait(deployment, '/repo', runner({ deployment: [workflow(next)] }))).toMatchObject({ status: 'success', commit: next });
    expect(await probeGitHubWait(deployment, '/repo', runner({ deployment: [workflow(next)], comparison: 'diverged' }))).toEqual({ status: 'pending' });
  });
  it('uses the latest attempt, including a failing rerun', async () => {
    expect(await probeGitHubWait(target, '/repo', runner({ ci: [workflow(head, 'failure'), workflow()] }))).toMatchObject({ status: 'failure' });
  });
  it('requires both CI and TEST success and a clean matching PR checkout', async () => {
    const input = { workspacePath: '/repo', agentsContent: '', qualityPolicy: policy, hasAgentBrowserEvidence: false };
    expect((await checkAgentsCompletionGate(input, runner())).ok).toBe(true);
    expect((await checkAgentsCompletionGate(input, runner({ deployment: [workflow(merge, 'failure')] }))).ok).toBe(false);
    expect((await checkAgentsCompletionGate(input, runner({ localHead: next }))).ok).toBe(false);
  });
  it('does not turn the German opt-in rule into a browser requirement', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo', qualityPolicy: null, hasAgentBrowserEvidence: false,
      agentsContent: 'Agenten führen keine selbstständigen agent-browser-E2E-Prüfungen durch; solche Prüfungen erfolgen nur auf ausdrückliche Aufforderung.',
    }, runner());
    expect(result.ok).toBe(true);
  });
  it('rejects malformed policy instead of weakening checks', () => {
    expect(() => projectQualitySchema.parse({ version: 1, ciWorkflow: '--help' })).toThrow();
  });
});
describe('browser evidence', () => {
  it('ignores errors, prose, command starts and failed commands', () => {
    expect(completedBrowserEvidence({ event: 'completion_gate_failed', raw: { message: 'No agent-browser evidence' } })).toBeNull();
    for (const command of ['cat /skills/agent-browser/SKILL.md', 'echo agent-browser open https://example.test', 'rg agent-browser .', 'agent-browser open https://example.test; echo ok']) {
      expect(completedBrowserEvidence({ event: 'item/completed', raw: { item: { type: 'commandExecution', command, status: 'completed', exitCode: 0 } } })).toBeNull();
    }
    expect(completedBrowserEvidence({ event: 'item/completed', raw: { item: { type: 'commandExecution', command: 'agent-browser open https://test.example', status: 'completed', exitCode: 1 } } })).toBeNull();
  });
  it('records a successful structured browser execution', () => {
    expect(completedBrowserEvidence({ event: 'item/completed', raw: { item: { type: 'commandExecution', command: 'agent-browser open https://test.example', status: 'completed', exitCode: 0 } } })).toContain('agent-browser open');
  });
});
