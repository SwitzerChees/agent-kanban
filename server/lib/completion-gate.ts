import { loadProjectQuality, type ProjectQuality } from './project-quality';
import { probeGitHubWait, runQualityCommand, type CommandRunner } from './github-quality';
export type { CommandResult, CommandRunner } from './github-quality';

export interface CompletionGateInput {
  workspacePath: string;
  agentsContent: string | null;
  hasAgentBrowserEvidence: boolean;
  taskIdentifier?: string | null;
  taskTitle?: string | null;
  qualityPolicy?: ProjectQuality | null;
}

export interface CompletionGateResult {
  ok: boolean;
  message: string;
  prompt?: string;
  metadata: Record<string, unknown>;
}

const MAIN_BRANCHES = new Set(['main', 'master']);

export async function checkAgentsCompletionGate(
  input: CompletionGateInput,
  runCommand: CommandRunner = runQualityCommand,
): Promise<CompletionGateResult> {
  const content = input.agentsContent ?? '';
  let policy: ProjectQuality | null;
  try { policy = input.qualityPolicy === undefined ? await loadProjectQuality(input.workspacePath) : input.qualityPolicy; }
  catch { return { ok: false, message: 'Invalid .agent-kanban-quality.json', prompt: 'Repair the invalid project quality policy before finishing.', metadata: {} }; }
  const requiresPullRequest = policy?.pullRequest ?? (/pull request|\bpr\b/i.test(content) && /merge|merged|master|main/i.test(content));
  const requiresAgentBrowser = policy ? policy.browser === 'required' : content.split('\n').some(line =>
    /agent-browser/i.test(line) && /must|required|muss|muessen|müssen|verpflichtend/i.test(line)
    && !/\b(no|not|never|only|keine?|nicht|niemals|nur)\b/i.test(line));

  if (!requiresPullRequest && !requiresAgentBrowser) {
    return passed({ skipped: true });
  }

  const issues: string[] = [];
  const metadata: Record<string, unknown> = {
    requiresPullRequest,
    requiresAgentBrowser,
    workspacePath: input.workspacePath,
  };

  if (requiresPullRequest) {
    const gitRoot = await runCommand('git', ['rev-parse', '--show-toplevel'], input.workspacePath);
    metadata.gitRoot = gitRoot.ok ? gitRoot.stdout.trim() : null;
    if (!gitRoot.ok) {
      issues.push('AGENTS.md requires a branch and GitHub Pull Request workflow, but this workspace is not a Git repository.');
    } else {
      const status = await runCommand('git', ['status', '--porcelain'], input.workspacePath);
      metadata.gitStatus = status.ok ? status.stdout.trim() : status.stderr.trim();
      if (!status.ok || status.stdout.trim()) {
        issues.push('The Git workspace is not clean. Commit and push all intended changes on the task branch before finishing.');
      }

      const branch = await runCommand('git', ['branch', '--show-current'], input.workspacePath);
      const branchName = branch.ok ? branch.stdout.trim() : '';
      metadata.branchName = branchName || null;
      if (!branch.ok || !branchName) {
        issues.push('The current Git branch could not be determined.');
      } else if (MAIN_BRANCHES.has(branchName)) {
        const mergedPullRequest = await findMergedPullRequestForTask(input, runCommand);
        metadata.pullRequest = mergedPullRequest;
        if (!mergedPullRequest) {
          issues.push(`The task is on '${branchName}' and no merged task Pull Request could be verified. AGENTS.md requires a dedicated task branch and PR workflow.`);
        }
      } else {
        const pr = await runCommand('gh', ['pr', 'view', '--json', policy ? 'number,state,mergedAt,url,headRefName,headRefOid,baseRefName,mergeCommit' : 'state,mergedAt,url,headRefName,baseRefName'], input.workspacePath);
        if (!pr.ok) {
          metadata.pullRequestError = pr.stderr.trim() || pr.stdout.trim();
          issues.push('No GitHub Pull Request could be verified for the current branch.');
        } else {
          const parsed = parseJsonObject(pr.stdout);
          metadata.pullRequest = parsed ?? pr.stdout.trim();
          const state = typeof parsed?.state === 'string' ? parsed.state : null;
          const mergedAt = typeof parsed?.mergedAt === 'string' ? parsed.mergedAt : null;
          const url = typeof parsed?.url === 'string' ? parsed.url : null;
          if (state !== 'MERGED' || !mergedAt) {
            issues.push(url
              ? `Pull Request ${url} is not merged yet. AGENTS.md requires merging through the PR before completion.`
              : 'The GitHub Pull Request is not merged yet.');
          }
        }
      }
    }
  }

  if (policy && requiresPullRequest) {
    const pr = metadata.pullRequest as { number?: number; state?: string; headRefOid?: string; mergeCommit?: { oid: string } } | undefined;
    const head = await runCommand('git', ['rev-parse', 'HEAD'], input.workspacePath);
    if (!pr?.headRefOid || !head.ok || head.stdout.trim() !== pr.headRefOid) {
      issues.push('The task checkout must match the verified PR head commit; no stale PR or unpushed changes may complete.');
    } else if (pr.state === 'MERGED' && pr.number) {
      for (const kind of ['ci', 'deployment'] as const) {
        const workflow = kind === 'ci' ? policy.ciWorkflow : policy.deploymentWorkflow;
        if (!workflow) continue;
        const commit = kind === 'ci' ? pr.headRefOid : pr.mergeCommit?.oid;
        if (!commit) { issues.push('Merged commit identity is missing.'); continue; }
        const evidence = await probeGitHubWait({ kind, workflow, commit, branch: policy.deploymentBranch, pullRequest: pr.number, createdAt: new Date().toISOString() }, input.workspacePath, runCommand);
        metadata[kind] = evidence;
        if (evidence.status !== 'success') issues.push(`${kind} for ${commit} is ${evidence.status}${evidence.url ? `: ${evidence.url}` : ''}. Wait for the matching workflow or repair its failure.`);
      }
    }
  }

  if (requiresAgentBrowser && !input.hasAgentBrowserEvidence) {
    issues.push('No agent-browser E2E or smoke-test command was recorded for this task run.');
  }

  if (issues.length === 0) return passed(metadata);

  return {
    ok: false,
    message: `Completion gate failed: ${issues.join(' ')}`,
    prompt: buildRepairPrompt(issues),
    metadata: { ...metadata, issues },
  };
}

async function findMergedPullRequestForTask(input: CompletionGateInput, runCommand: CommandRunner) {
  const searchTerms = [input.taskIdentifier, input.taskTitle]
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term));

  for (const term of searchTerms) {
    const result = await runCommand('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--search',
      `${term} in:title`,
      '--json',
      'state,mergedAt,url,headRefName,baseRefName',
      '--limit',
      '10',
    ], input.workspacePath);

    if (!result.ok) continue;
    const pullRequests = parseJsonArray(result.stdout);
    const merged = pullRequests.find((item) => item.state === 'MERGED' && typeof item.mergedAt === 'string' && item.mergedAt);
    if (merged) return merged;
  }

  return null;
}

function passed(metadata: Record<string, unknown>): CompletionGateResult {
  return {
    ok: true,
    message: 'Completion gate passed',
    metadata,
  };
}

function buildRepairPrompt(issues: string[]) {
  return [
    'Automated completion gate failed. Continue this same task; do not report completion yet.',
    '',
    'Findings:',
    ...issues.map((issue) => `- ${issue}`),
    '',
    'Required actions:',
    '- Follow the loaded AGENTS.md exactly.',
    '- Keep work on a dedicated branch, push it, use a GitHub Pull Request, and merge to master/main only through the PR if AGENTS.md requires that workflow.',
    '- Run the required agent-browser E2E or smoke test against the testsystem URL when AGENTS.md requires it.',
    '- Only finish after the gate findings are resolved.',
  ].join('\n');
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}
