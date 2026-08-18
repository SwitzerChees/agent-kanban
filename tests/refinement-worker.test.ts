import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RefinementContext } from '../server/lib/refinements';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-refinement-worker-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'refinement-worker@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'refinement-worker-password';

let worker: typeof import('../server/lib/refinement-worker');

beforeAll(async () => {
  worker = await import('../server/lib/refinement-worker');
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('refinement worker contracts', () => {
  test('validates completed and challenge-question structured output', () => {
    const completed = worker.parseRefinementOutput({
      status: 'completed',
      complexity: 'moderate',
      questions: [],
      result: {
        summary: 'Introduce a project-aware overview.',
        integrationPlan: ['Reuse the existing project query.'],
        applicationImpact: ['Adds one read-only view.'],
        risks: [{ risk: 'Crowded layout', mitigation: 'Use progressive disclosure', severity: 'medium' }],
        acceptanceCriteria: ['Keyboard navigation remains complete.'],
        openQuestions: [],
        notes: [],
      },
      visuals: [],
    });
    expect(completed).toMatchObject({ status: 'completed', complexity: 'moderate' });

    expect(() => worker.parseRefinementOutput({
      ...completed,
      status: 'needs_input',
      questions: [],
    })).toThrowError(/needs_input requires at least one question/);
  });

  test('builds a resume prompt with answers and a hard question-round limit', () => {
    const context = sampleContext({
      round: 4,
      questions: [
        answeredQuestion(1, 'Audience?', 'Contributors'),
        answeredQuestion(2, 'Scope?', 'One project'),
        answeredQuestion(3, 'Rollout?', 'Directly'),
      ],
      answeredQuestions: [
        answeredQuestion(1, 'Audience?', 'Contributors'),
        answeredQuestion(2, 'Scope?', 'One project'),
        answeredQuestion(3, 'Rollout?', 'Directly'),
      ],
    });
    const prompt = worker.buildRefinementPrompt(context, {
      agentsPath: null,
      agentsContent: null,
      agentsTruncated: false,
      projectInstructions: '# Mandatory Project Instructions\nUse DESIGN.md.',
      usedQuestionRounds: 3,
    });

    expect(prompt).toContain('Rollout?');
    expect(prompt).toContain('Answer: Directly');
    expect(prompt).not.toContain('Answer: Contributors');
    expect(prompt).toContain('All challenge-question rounds are used');
    expect(prompt).toContain('strictly read-only analysis');
    expect(prompt).toContain('Use DESIGN.md.');
  });

  test('requires the same progressive final format for every harness', () => {
    const prompts = ['codex', 'opencode', 'prime-agent'].map((agentHarness) => worker.buildRefinementPrompt(
      sampleContext({ agentHarness: agentHarness as RefinementContext['agentHarness'] }),
      {
        agentsPath: null,
        agentsContent: null,
        agentsTruncated: false,
        usedQuestionRounds: 0,
      },
    ));

    for (const prompt of prompts) {
      const summary = prompt.indexOf('result.summary is the first section');
      const productDetails = prompt.indexOf('result.applicationImpact is the second');
      const technicalDetails = prompt.indexOf('Put implementation depth only in result.integrationPlan');
      expect(summary).toBeGreaterThan(0);
      expect(productDetails).toBeGreaterThan(summary);
      expect(technicalDetails).toBeGreaterThan(productDetails);
      expect(prompt).toContain('2-4 short sentences in plain everyday language');
      expect(prompt).toContain('same harness session will resume');
    }
  });

  test('accepts real generated image bytes but rejects symlinks and non-images', async () => {
    const pngPath = path.join(testRoot, 'concept.png');
    const linkPath = path.join(testRoot, 'concept-link.png');
    const textPath = path.join(testRoot, 'not-an-image.png');
    writeFileSync(pngPath, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('generated-concept'),
    ]));
    writeFileSync(textPath, 'not actually an image');
    symlinkSync(pngPath, linkPath);

    await expect(worker.readValidatedGeneratedImage(pngPath, testRoot)).resolves.toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
    });
    await expect(worker.readValidatedGeneratedImage(linkPath, testRoot)).rejects.toThrow('refinement_image_symlink_rejected');
    await expect(worker.readValidatedGeneratedImage(textPath, testRoot)).rejects.toThrow('refinement_image_format_invalid');
    await expect(worker.readValidatedGeneratedImage('relative.png', testRoot)).rejects.toThrow('refinement_image_path_not_absolute');
  });
});

function sampleContext(overrides: Partial<RefinementContext> = {}): RefinementContext {
  return {
    id: 'refinement-id',
    taskId: 'task-id',
    taskKey: 'TASK-1',
    taskTitle: 'Refine the project overview',
    taskDescription: 'Add an overview grounded in existing project data.',
    agentHarness: 'codex',
    reasoningEffort: 'xhigh',
    projectId: 'project-id',
    projectKey: 'PROJECT',
    projectName: 'Project',
    projectFolderPath: testRoot,
    requestedBy: 'user-id',
    requestedByName: 'Test User',
    brief: 'Challenge the layout and implementation path.',
    visualMode: 'auto',
    sourceCodeRevision: 'abc123-dirty',
    threadId: 'thread-id',
    leaseOwner: 'worker-id',
    leaseToken: 'lease-token',
    leaseExpiresAt: '2026-07-15T12:01:30.000Z',
    round: 1,
    questions: [],
    answeredQuestions: [],
    attachments: [],
    ...overrides,
  };
}

function answeredQuestion(round: number, question: string, answer: string) {
  return {
    id: `question-${round}`,
    question,
    rationale: null,
    type: 'text' as const,
    options: [],
    required: true,
    round,
    answer,
    answeredAt: '2026-07-15T12:00:00.000Z',
    answeredBy: 'user-id',
  };
}
