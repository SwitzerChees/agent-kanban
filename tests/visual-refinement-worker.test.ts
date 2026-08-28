import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-visual-worker-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'visual-worker-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'visual-worker-test-password';

let visualWorker: typeof import('../server/lib/visual-refinement-worker');

beforeAll(async () => {
  visualWorker = await import('../server/lib/visual-refinement-worker');
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('visual refinement worker resilience', () => {
  test('keeps the render workflow focused and releases browser resources promptly', () => {
    const instructions = visualWorker.visualRuntimeInstructions();
    expect(instructions).toContain('Always reuse the injected `AGENT_BROWSER_SESSION`');
    expect(instructions).toContain('Do not run repository-wide lint, typecheck, test, audit, or production-build suites');
    expect(instructions).toContain('stop temporary development servers as soon as the screenshots and manifest are complete');

    const prompt = visualWorker.buildVisualRefinementPrompt({
      version: 1,
      taskKey: 'VISUAL-1',
      taskTitle: 'Calm task view',
      taskDescription: 'Render a real proposal.',
      brief: 'Show desktop and mobile.',
      visualSettings: { desktop: true, mobile: true, states: false },
      visualFeedbackComments: [],
    } as unknown as Parameters<typeof visualWorker.buildVisualRefinementPrompt>[0], '/workspace/manifest.json', '/workspace/artifacts');
    expect(prompt).toContain('as soon as the first complete target screenshot set exists');
    expect(prompt).toContain('do not postpone it until after optional checks');
  });

  test('recovers complete target screenshots after an interrupted agent session', async () => {
    const workspace = path.join(testRoot, 'recover-workspace');
    const artifactDirectory = path.join(workspace, '.agent-kanban', 'visual-refinements', 'run-1');
    const manifestPath = path.join(artifactDirectory, 'manifest.json');
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(path.join(artifactDirectory, 'baseline-employees-desktop.png'), pngHeader(1440, 900));
    writeFileSync(path.join(artifactDirectory, 'employees-actions-desktop.png'), pngHeader(1440, 900));
    writeFileSync(path.join(artifactDirectory, 'import-history-mobile.png'), pngHeader(390, 900));
    writeFileSync(path.join(artifactDirectory, 'incomplete.png'), Buffer.from('not-an-image'));

    const recovered = await visualWorker.recoverVisualManifest(manifestPath, artifactDirectory, workspace);

    expect(recovered).toMatchObject({
      artifacts: [
        { title: 'Employees Actions Desktop', width: 1440, height: 900, baselinePath: null },
        { title: 'Import History Mobile', width: 390, height: 900, baselinePath: null },
      ],
    });
    expect(recovered?.summary).toContain('2 gerenderte Ansichten');
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toEqual(recovered);
  });

  test('does not mistake a baseline-only capture for a completed proposal', async () => {
    const workspace = path.join(testRoot, 'baseline-only-workspace');
    const artifactDirectory = path.join(workspace, '.agent-kanban', 'visual-refinements', 'run-2');
    const manifestPath = path.join(artifactDirectory, 'manifest.json');
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(path.join(artifactDirectory, 'before-task-dialog.png'), pngHeader(1440, 900));

    await expect(visualWorker.recoverVisualManifest(manifestPath, artifactDirectory, workspace))
      .resolves.toBeNull();
  });
});

function pngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
