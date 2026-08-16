import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-refinements-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'refinement-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'refinement-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let refinements: typeof import('../server/lib/refinements');
let workerModule: typeof import('../server/lib/refinement-worker');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  refinements = await import('../server/lib/refinements');
  workerModule = await import('../server/lib/refinement-worker');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('task refinements', () => {
  test('runs a versioned challenge-question round and applies the result safely', async () => {
    const project = await kanban.createProject({
      name: 'Refinement Project',
      key: 'REFINE',
      folderPath: path.join(testRoot, 'workspace-refinement'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'A rough product idea',
      description: 'Add a useful overview.',
    }, admin);
    await expect(kanban.updateTask(task!.id, { descriptionSource: 'refined' }, admin))
      .rejects.toMatchObject({ statusMessage: 'refined_description_missing' });

    const first = refinements.createTaskRefinement(task!.id, {
      brief: 'Challenge the navigation and propose an implementation.',
      visualMode: 'auto',
    }, admin);
    expect(first).toMatchObject({
      taskId: task!.id,
      version: 1,
      status: 'queued',
      round: 1,
      sourceDescription: 'Add a useful overview.',
      questions: [],
      visuals: [],
    });
    expect(() => refinements.createTaskRefinement(task!.id, {}, admin))
      .toThrowError(expect.objectContaining({ statusMessage: 'refinement_already_active' }));

    const claimed = refinements.claimNextQueuedRefinement();
    expect(claimed).toMatchObject({
      id: first.id,
      taskKey: task!.key,
      taskTitle: task!.title,
      taskDescription: task!.description,
      agentHarness: 'codex',
      reasoningEffort: 'xhigh',
      projectFolderPath: project.folderPath,
      round: 1,
      threadId: null,
    });
    refinements.recordRefinementWorkspaceSync(first.id, 'latest-master-revision', claimed!.leaseToken, {
      branch: 'master',
      dirty: false,
    });
    expect(refinements.getTaskRefinement(task!.id, first.id, admin).sourceCodeRevision).toBe('latest-master-revision');
    const waiting = refinements.requestRefinementInput(first.id, {
      threadId: 'thread-refinement-1',
      questions: [{
        id: 'audience',
        question: 'Who is the primary audience?',
        rationale: 'This changes the information hierarchy.',
        type: 'single_choice',
        options: ['Managers', 'Contributors'],
        required: true,
      }],
    }, claimed!.leaseToken);
    expect(waiting).toMatchObject({
      status: 'awaiting_input',
      threadId: 'thread-refinement-1',
      questions: [{ id: 'audience', round: 1, answer: null }],
    });

    expect(() => refinements.answerRefinementQuestions(task!.id, first.id, {}, admin))
      .toThrowError(expect.objectContaining({ statusMessage: 'refinement_answers_incomplete' }));
    const answered = refinements.answerRefinementQuestions(task!.id, first.id, {
      audience: 'Contributors',
    }, admin);
    expect(answered).toMatchObject({
      status: 'queued',
      round: 2,
      threadId: 'thread-refinement-1',
      questions: [{ id: 'audience', answer: 'Contributors', answeredBy: admin.id }],
    });

    const resumed = refinements.claimNextQueuedRefinement();
    expect(resumed).toMatchObject({
      id: first.id,
      threadId: 'thread-refinement-1',
      round: 2,
      answeredQuestions: [{ id: 'audience', answer: 'Contributors' }],
    });
    const completed = refinements.completeRefinement(first.id, {
      complexity: 'moderate',
      result: {
        summary: 'Create a contributor-focused overview.',
        integrationPlan: ['Add an overview route', 'Reuse the existing task queries'],
        applicationImpact: ['A faster project entry point'],
        risks: [{ risk: 'Dense content', mitigation: 'Use progressive disclosure', severity: 'medium' }],
        acceptanceCriteria: ['Overview is keyboard accessible'],
        openQuestions: [],
      },
      visuals: [{
        attachmentId: 'visual-attachment-id',
        fileName: 'overview-concept.png',
        mimeType: 'image/png',
        prompt: 'Contributor overview in the current design system',
      }],
    }, resumed!.leaseToken);
    expect(completed.status).toBe('completed');
    expect(completed.resultMarkdown).toContain('## Akzeptanzkriterien');
    expect(completed.result).toMatchObject({ summary: 'Create a contributor-focused overview.' });
    expect(completed.visuals).toEqual([expect.objectContaining({ attachmentId: 'visual-attachment-id' })]);

    const applied = refinements.applyTaskRefinement(task!.id, first.id, { mode: 'replace' }, admin);
    expect(applied.refinement.appliedBy).toBe(admin.id);
    expect(applied.task).toMatchObject({
      description: expect.stringContaining('Create a contributor-focused overview.'),
      originalDescription: 'Add a useful overview.',
      refinedDescription: expect.stringContaining('Create a contributor-focused overview.'),
      descriptionSource: 'refined',
    });
    const originalSelected = await kanban.updateTask(task!.id, { descriptionSource: 'original' }, admin);
    expect(originalSelected).toMatchObject({
      description: 'Add a useful overview.',
      originalDescription: 'Add a useful overview.',
      descriptionSource: 'original',
    });
    const refinedSelected = await kanban.updateTask(task!.id, { descriptionSource: 'refined' }, admin);
    expect(refinedSelected).toMatchObject({
      description: expect.stringContaining('Create a contributor-focused overview.'),
      originalDescription: 'Add a useful overview.',
      descriptionSource: 'refined',
    });
    expect(() => refinements.applyTaskRefinement(task!.id, first.id, {}, admin))
      .toThrowError(expect.objectContaining({ statusMessage: 'refinement_already_applied' }));

    const second = refinements.createTaskRefinement(task!.id, { visualMode: 'off' }, admin);
    expect(second).toMatchObject({ version: 2, visualMode: 'off', status: 'queued' });
    refinements.failRefinement(second.id, new Error('Synthetic failure'));
    expect(refinements.getTaskRefinement(task!.id, second.id, admin)).toMatchObject({
      status: 'failed',
      error: 'refinement_failed',
    });

    const timedOut = refinements.createTaskRefinement(task!.id, {}, admin);
    refinements.failRefinement(timedOut.id, Object.assign(
      new Error('raw internal detail that must never reach the client'),
      { code: 'turn_timeout' },
    ));
    expect(refinements.getTaskRefinement(task!.id, timedOut.id, admin)).toMatchObject({
      status: 'failed',
      error: 'refinement_timeout',
    });
    const persistedTimeout = dbModule.db.select().from(dbModule.schema.taskRefinements)
      .where(eq(dbModule.schema.taskRefinements.id, timedOut.id))
      .get();
    expect(persistedTimeout?.error).toBe('refinement_timeout');
    expect(JSON.stringify(persistedTimeout)).not.toContain('raw internal detail');

    const sanitizedCases = [
      { error: Object.assign(new Error('untrusted malformed payload'), { code: 'invalid_output' }), code: 'refinement_invalid_output' },
      { error: Object.assign(new Error('private git failure detail'), { code: 'refinement_master_sync_failed' }), code: 'refinement_master_sync_failed' },
      { error: Object.assign(new Error('workspace policy rejected a path'), { code: 'security_violation' }), code: 'refinement_security_policy' },
      { error: new Error('refinement_max_question_rounds_exceeded'), code: 'refinement_question_limit' },
    ];
    for (const scenario of sanitizedCases) {
      const run = refinements.createTaskRefinement(task!.id, {}, admin);
      refinements.failRefinement(run.id, scenario.error);
      expect(refinements.getTaskRefinement(task!.id, run.id, admin).error).toBe(scenario.code);
    }
  });

  test('ignores metadata changes and confirms before replacing a changed description', async () => {
    const project = await kanban.createProject({
      name: 'Protected Refinement Project',
      key: 'PROTECTED',
      folderPath: path.join(testRoot, 'workspace-protected'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Protect the source description',
      description: 'Original description',
    }, admin);
    const member = insertUser('refinement-member', 'Refinement Member');
    const outsider = insertUser('refinement-outsider', 'Refinement Outsider');
    kanban.addProjectUser(project.id, member.id, admin);

    const refinement = refinements.createTaskRefinement(task!.id, {}, member);
    expect(refinements.listTaskRefinements(task!.id, member)).toHaveLength(1);
    expect(() => refinements.listTaskRefinements(task!.id, outsider))
      .toThrowError(expect.objectContaining({ statusMessage: 'project_forbidden' }));

    const claimed = refinements.claimNextQueuedRefinement();
    expect(claimed?.id).toBe(refinement.id);
    refinements.completeRefinement(refinement.id, {
      complexity: 'simple',
      resultMarkdown: 'Refined description',
    }, claimed!.leaseToken);
    dbModule.db.update(dbModule.schema.tasks).set({
      title: 'A harmless title update',
      updatedAt: '2099-01-01T00:00:00.000Z',
    }).where(eq(dbModule.schema.tasks.id, task!.id)).run();

    const appliedAfterTitleChange = refinements.applyTaskRefinement(task!.id, refinement.id, {}, member);
    expect(appliedAfterTitleChange.task).toMatchObject({
      title: 'A harmless title update',
      description: 'Refined description',
      originalDescription: 'Original description',
      refinedDescription: 'Refined description',
      descriptionSource: 'refined',
    });

    const changedDescriptionRefinement = refinements.createTaskRefinement(task!.id, {}, member);
    const secondClaim = refinements.claimNextQueuedRefinement();
    expect(secondClaim?.id).toBe(changedDescriptionRefinement.id);
    refinements.completeRefinement(changedDescriptionRefinement.id, {
      complexity: 'simple',
      resultMarkdown: 'A newer refined description',
    }, secondClaim!.leaseToken);
    dbModule.db.update(dbModule.schema.tasks).set({
      refinedDescription: 'Changed while refinement was running',
      updatedAt: '2099-01-02T00:00:00.000Z',
    }).where(eq(dbModule.schema.tasks.id, task!.id)).run();

    expect(() => refinements.applyTaskRefinement(task!.id, changedDescriptionRefinement.id, {}, member))
      .toThrowError(expect.objectContaining({ statusMessage: 'refinement_description_changed' }));

    const confirmed = refinements.applyTaskRefinement(task!.id, changedDescriptionRefinement.id, {
      allowDescriptionOverwrite: true,
    }, member);
    expect(confirmed.task).toMatchObject({
      description: 'A newer refined description',
      originalDescription: 'Original description',
      refinedDescription: 'A newer refined description',
      descriptionSource: 'refined',
    });

    const restored = await kanban.updateTask(task!.id, { descriptionSource: 'original' }, member);
    expect(restored).toMatchObject({
      description: 'Original description',
      originalDescription: 'Original description',
      refinedDescription: 'A newer refined description',
      descriptionSource: 'original',
    });
  });

  test('fences concurrent workers and only recovers expired leases', async () => {
    const project = await kanban.createProject({
      name: 'Leased Refinement Project',
      key: 'LEASED',
      folderPath: path.join(testRoot, 'workspace-leased'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Do not duplicate this turn',
      description: 'One Codex turn must own this work at a time.',
    }, admin);
    const refinement = refinements.createTaskRefinement(task!.id, {}, admin);
    const startedAt = new Date('2099-07-15T12:00:00.000Z');

    const firstClaim = refinements.claimNextQueuedRefinement({
      ownerId: 'worker-a',
      leaseMs: 10_000,
      now: startedAt,
    });
    expect(firstClaim).toMatchObject({ id: refinement.id, leaseOwner: 'worker-a' });
    expect(refinements.claimNextQueuedRefinement({ ownerId: 'worker-b', now: startedAt })).toBeNull();

    refinements.setRefinementThread(refinement.id, 'thread-persisted-before-turn-finished', firstClaim!.leaseToken);
    expect(refinements.requeueStaleRefinements('2099-07-15T12:00:05.000Z')).toBe(0);
    expect(refinements.heartbeatRefinementLease({
      refinementId: refinement.id,
      leaseToken: firstClaim!.leaseToken,
      ownerId: 'worker-b',
      leaseMs: 10_000,
      now: '2099-07-15T12:00:05.000Z',
    })).toBe(false);
    expect(refinements.heartbeatRefinementLease({
      refinementId: refinement.id,
      leaseToken: firstClaim!.leaseToken,
      ownerId: 'worker-a',
      leaseMs: 10_000,
      now: '2099-07-15T12:00:05.000Z',
    })).toBe(true);
    expect(refinements.requeueStaleRefinements('2099-07-15T12:00:11.000Z')).toBe(0);
    expect(refinements.requeueStaleRefinements('2099-07-15T12:00:16.000Z')).toBe(1);

    const successor = refinements.claimNextQueuedRefinement({
      ownerId: 'worker-b',
      leaseMs: 60_000,
      now: '2099-07-15T12:00:16.000Z',
    });
    expect(successor).toMatchObject({
      id: refinement.id,
      leaseOwner: 'worker-b',
      threadId: 'thread-persisted-before-turn-finished',
    });
    expect(successor!.leaseToken).not.toBe(firstClaim!.leaseToken);
    expect(() => refinements.completeRefinement(refinement.id, {
      complexity: 'simple',
      resultMarkdown: 'Stale worker result',
    }, firstClaim!.leaseToken)).toThrowError(expect.objectContaining({ statusMessage: 'refinement_state_changed' }));

    refinements.completeRefinement(refinement.id, {
      complexity: 'simple',
      resultMarkdown: 'Successor result',
    }, successor!.leaseToken);
    const publicRun = refinements.getTaskRefinement(task!.id, refinement.id, admin);
    expect(publicRun).not.toHaveProperty('leaseOwner');
    expect(publicRun).not.toHaveProperty('leaseToken');
    expect(publicRun).not.toHaveProperty('leaseExpiresAt');

    const legacyRun = refinements.createTaskRefinement(task!.id, {}, admin);
    const legacyClaim = refinements.claimNextQueuedRefinement({
      ownerId: 'pre-lease-worker',
      now: '2099-07-15T13:00:00.000Z',
    });
    expect(legacyClaim?.id).toBe(legacyRun.id);
    dbModule.db.update(dbModule.schema.taskRefinements).set({
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: '2099-07-15T13:00:00.000Z',
    }).where(eq(dbModule.schema.taskRefinements.id, legacyRun.id)).run();
    expect(refinements.requeueStaleRefinements('2099-07-15T13:00:30.000Z')).toBe(0);
    expect(refinements.requeueStaleRefinements('2099-07-15T13:01:31.000Z')).toBe(1);
    refinements.failRefinement(legacyRun.id, new Error('cleanup'));
  });

  test('awaits aborted work and releases its fenced lease during shutdown', async () => {
    const project = await kanban.createProject({
      name: 'Shutdown Refinement Project',
      key: 'SHUTDOWN',
      folderPath: path.join(testRoot, 'workspace-shutdown'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Release cleanly on deploy',
      description: 'The next process should not wait for lease expiry.',
    }, admin);
    const refinement = refinements.createTaskRefinement(task!.id, {}, admin);
    let signalProcessorStarted!: () => void;
    const processorStarted = new Promise<void>((resolve) => { signalProcessorStarted = resolve; });
    let observedAbort = false;
    const worker = new workerModule.RefinementWorker(async (_context, signal) => {
      signalProcessorStarted();
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          observedAbort = true;
          resolve();
          return;
        }
        signal.addEventListener('abort', () => {
          observedAbort = true;
          resolve();
        }, { once: true });
      });
    });

    worker.start();
    await processorStarted;
    const running = dbModule.db.select().from(dbModule.schema.taskRefinements)
      .where(eq(dbModule.schema.taskRefinements.id, refinement.id))
      .get();
    expect(running).toMatchObject({ status: 'running' });
    expect(running?.leaseToken).toBeTruthy();

    await worker.stop();

    expect(observedAbort).toBe(true);
    const released = dbModule.db.select().from(dbModule.schema.taskRefinements)
      .where(eq(dbModule.schema.taskRefinements.id, refinement.id))
      .get();
    expect(released).toMatchObject({
      status: 'queued',
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    });
    refinements.failRefinement(refinement.id, new Error('cleanup'));
  });
});

function insertUser(id: string, name: string): User {
  const now = new Date().toISOString();
  const user: User = {
    id,
    email: `${id}@example.com`,
    name,
    passwordHash: 'unused',
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(user).run();
  return user;
}
