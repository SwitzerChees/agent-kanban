import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { parseWorkflowSource } from '../server/lib/workflow';
import { resolveServiceConfig, validateDispatchConfig } from '../server/lib/config';
import type { WorkflowDefinition } from '../server/lib/types';

describe('workflow and config', () => {
  it('parses YAML front matter and trims prompt body', () => {
    const parsed = parseWorkflowSource(`---
tracker:
  kind: linear
---
# Prompt
`);

    expect(parsed.config).toEqual({ tracker: { kind: 'linear' } });
    expect(parsed.prompt_template).toBe('# Prompt');
  });

  it('resolves defaults, env refs, and workspace paths', () => {
    const workflow: WorkflowDefinition = {
      path: '/repo/WORKFLOW.md',
      dir: '/repo',
      loaded_at: '2026-05-15T00:00:00.000Z',
      config: {
        tracker: {
          kind: 'linear',
          api_key: '$LINEAR_API_KEY',
          project_slug: 'MT',
        },
        workspace: {
          root: './work',
        },
        codex: {
          model: 'gpt-5.6-sol',
          reasoning_effort: 'xhigh',
        },
      },
      prompt_template: 'Hello {{ issue.identifier }}',
    };

    const config = resolveServiceConfig(workflow, { LINEAR_API_KEY: 'secret' });

    expect(config.tracker.apiKey).toBe('secret');
    expect(config.tracker.activeStates).toEqual(['Todo', 'In Progress']);
    expect(config.workspace.root).toBe(path.normalize('/repo/work'));
    expect(config.codex.model).toBe('gpt-5.6-sol');
    expect(config.codex.reasoningEffort).toBe('xhigh');
    expect(validateDispatchConfig(config).ok).toBe(true);
  });

  it('reports dispatch validation failures without printing secrets', () => {
    const workflow: WorkflowDefinition = {
      path: '/repo/WORKFLOW.md',
      dir: '/repo',
      loaded_at: '2026-05-15T00:00:00.000Z',
      config: {
        tracker: {
          kind: 'linear',
        },
      },
      prompt_template: '',
    };

    const config = resolveServiceConfig(workflow, {});
    const validation = validateDispatchConfig(config);

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('missing_tracker_api_key');
    expect(validation.issues.map((issue) => issue.code)).toContain('missing_tracker_project_slug');
  });
});
