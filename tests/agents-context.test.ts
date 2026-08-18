import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgentsPromptPrefix, loadAgentsContext } from '../server/lib/agents-context';

describe('AGENTS.md context loading', () => {
  it('loads AGENTS.md from the configured workspace root', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ak-agents-root-'));
    try {
      await writeFile(path.join(dir, 'AGENTS.md'), '# Rules\n\n- Use PRs only.\n');
      const context = await loadAgentsContext(dir);

      expect(context.path).toBe(path.join(dir, 'AGENTS.md'));
      expect(context.content).toContain('Use PRs only');
      expect(buildAgentsPromptPrefix(context)).toContain('Mandatory Project Instructions');
      expect(buildAgentsPromptPrefix(context)).toContain('Use PRs only');
      expect(context.documents).toMatchObject([
        { path: path.join(dir, 'AGENTS.md'), kind: 'agents', truncated: false },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('injects recognized design and engineering guidance beside the project and in docs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ak-guidance-'));
    try {
      await mkdir(path.join(dir, 'docs'));
      await writeFile(path.join(dir, 'AGENTS.md'), '# Workflow\n\n- Validate before finishing.\n');
      await writeFile(path.join(dir, 'DESIGN.md'), '# Design\n\nUse the established visual language.\n');
      await writeFile(path.join(dir, 'docs', 'ARCHITECTURE.md'), '# Architecture\n\nKeep domain boundaries intact.\n');

      const context = await loadAgentsContext(dir);
      const prompt = buildAgentsPromptPrefix(context);

      expect(context.documents.map((document) => path.basename(document.path)))
        .toEqual(['AGENTS.md', 'DESIGN.md', 'ARCHITECTURE.md']);
      expect(prompt).toContain('Use the established visual language');
      expect(prompt).toContain('Keep domain boundaries intact');
      expect(prompt).toContain('re-check them against the final diff');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('combines ancestor and project AGENTS.md from broad to specific', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ak-agents-hierarchy-'));
    try {
      const appDir = path.join(dir, 'apps', 'web');
      await mkdir(appDir, { recursive: true });
      await writeFile(path.join(dir, 'AGENTS.md'), '# Root rules\n');
      await writeFile(path.join(dir, 'DESIGN.md'), '# Shared design\n');
      await writeFile(path.join(appDir, 'AGENTS.md'), '# Web rules\n');

      const context = await loadAgentsContext(appDir, dir);

      expect(context.documents.map((document) => document.path)).toEqual([
        path.join(dir, 'AGENTS.md'),
        path.join(appDir, 'AGENTS.md'),
        path.join(dir, 'DESIGN.md'),
      ]);
      expect(context.content?.indexOf('Root rules')).toBeLessThan(context.content?.indexOf('Web rules') ?? 0);
      expect(context.path).toBe(path.join(appDir, 'AGENTS.md'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('finds a nested AGENTS.md when the project folder points at a parent directory', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ak-agents-nested-'));
    try {
      const appDir = path.join(dir, 'app');
      await mkdir(appDir);
      await writeFile(path.join(appDir, 'AGENTS.md'), '# Nested Rules\n');
      const context = await loadAgentsContext(dir);

      expect(context.path).toBe(path.join(appDir, 'AGENTS.md'));
      expect(context.content).toContain('Nested Rules');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
