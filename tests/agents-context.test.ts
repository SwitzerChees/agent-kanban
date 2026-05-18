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
