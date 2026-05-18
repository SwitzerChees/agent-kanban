import { describe, expect, it } from 'vitest';
import { checkAgentsCompletionGate, type CommandRunner } from '../server/lib/completion-gate';

const agentsWithPrRules = [
  'Jede Codex-Aufgabe arbeitet in einem eigenen Branch, pusht diesen Branch, öffnet einen GitHub Pull Request und merged über den PR in master.',
  'Das Ergebnis muss mit agent-browser als E2E-Prüfung validiert werden.',
].join('\n');

describe('AGENTS.md completion gate', () => {
  it('does nothing when AGENTS.md has no enforceable workflow rules', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo',
      agentsContent: '# Notes',
      hasAgentBrowserEvidence: false,
    }, async () => ({ ok: false, stdout: '', stderr: 'should not run' }));

    expect(result.ok).toBe(true);
    expect(result.metadata.skipped).toBe(true);
  });

  it('rejects finishing on master without a merged task PR and agent-browser evidence', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo',
      agentsContent: agentsWithPrRules,
      hasAgentBrowserEvidence: false,
      taskIdentifier: 'TASK-1',
    }, fakeRunner({
      'git rev-parse --show-toplevel': { ok: true, stdout: '/repo\n', stderr: '' },
      'git status --porcelain': { ok: true, stdout: '', stderr: '' },
      'git branch --show-current': { ok: true, stdout: 'master\n', stderr: '' },
      'gh pr list --state merged --search TASK-1 in:title --json state,mergedAt,url,headRefName,baseRefName --limit 10': {
        ok: true,
        stdout: '[]',
        stderr: '',
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no merged task Pull Request");
    expect(result.message).toContain('agent-browser');
  });

  it('rejects an unmerged pull request', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo',
      agentsContent: agentsWithPrRules,
      hasAgentBrowserEvidence: true,
    }, fakeRunner({
      'git rev-parse --show-toplevel': { ok: true, stdout: '/repo\n', stderr: '' },
      'git status --porcelain': { ok: true, stdout: '', stderr: '' },
      'git branch --show-current': { ok: true, stdout: 'codex/task\n', stderr: '' },
      'gh pr view --json state,mergedAt,url,headRefName,baseRefName': {
        ok: true,
        stdout: JSON.stringify({ state: 'OPEN', mergedAt: null, url: 'https://github.com/acme/repo/pull/1' }),
        stderr: '',
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('is not merged yet');
  });

  it('passes when the PR is merged and agent-browser evidence exists', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo',
      agentsContent: agentsWithPrRules,
      hasAgentBrowserEvidence: true,
    }, fakeRunner({
      'git rev-parse --show-toplevel': { ok: true, stdout: '/repo\n', stderr: '' },
      'git status --porcelain': { ok: true, stdout: '', stderr: '' },
      'git branch --show-current': { ok: true, stdout: 'codex/task\n', stderr: '' },
      'gh pr view --json state,mergedAt,url,headRefName,baseRefName': {
        ok: true,
        stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-05-17T16:00:00Z', url: 'https://github.com/acme/repo/pull/1' }),
        stderr: '',
      },
    }));

    expect(result.ok).toBe(true);
  });

  it('passes on master after a matching task PR has been merged', async () => {
    const result = await checkAgentsCompletionGate({
      workspacePath: '/repo',
      agentsContent: agentsWithPrRules,
      hasAgentBrowserEvidence: true,
      taskIdentifier: 'TASK-2',
    }, fakeRunner({
      'git rev-parse --show-toplevel': { ok: true, stdout: '/repo\n', stderr: '' },
      'git status --porcelain': { ok: true, stdout: '', stderr: '' },
      'git branch --show-current': { ok: true, stdout: 'master\n', stderr: '' },
      'gh pr list --state merged --search TASK-2 in:title --json state,mergedAt,url,headRefName,baseRefName --limit 10': {
        ok: true,
        stdout: JSON.stringify([{ state: 'MERGED', mergedAt: '2026-05-18T08:00:00Z', url: 'https://github.com/acme/repo/pull/2' }]),
        stderr: '',
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.metadata.pullRequest).toMatchObject({ url: 'https://github.com/acme/repo/pull/2' });
  });
});

function fakeRunner(responses: Record<string, Awaited<ReturnType<CommandRunner>>>) {
  return async (command: string, args: string[]) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];
    if (!response) return { ok: false, stdout: '', stderr: `missing fake response: ${key}` };
    return response;
  };
}
