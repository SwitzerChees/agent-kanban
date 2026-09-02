import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-e2e-tests-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'e2e-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'e2e-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let e2e: typeof import('../server/lib/e2e-tests');
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  e2e = await import('../server/lib/e2e-tests');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  member = insertUser('e2e-member', 'E2E Member');
  outsider = insertUser('e2e-outsider', 'E2E Outsider');
  const project = await kanban.createProject({
    name: 'E2E Project', key: 'E2E', folderPath: path.join(testRoot, 'project'),
    userIds: [member.id], e2eConcurrencyLimit: 3,
  }, admin);
  projectId = project.id;
});

afterAll(() => rmSync(testRoot, { recursive: true, force: true }));

describe('project E2E test catalog', () => {
  test('stores suites, executable role scenarios, and immutable run snapshots', async () => {
    const suite = e2e.createE2eSuite(projectId, { name: 'Post-deployment smoke', description: 'Critical journeys' }, admin);
    const testCase = e2e.createE2eCase(projectId, {
      suiteId: suite.id,
      title: 'Employee vacation request',
      scenario: 'Create a vacation request and assign a substitute.',
      preconditions: 'An isolated tenant with Anna and Nina exists.',
      expectedResult: 'The request is pending and visible in the calendar.',
      roles: ['Employee', 'HR'],
      targetUrl: 'https://test.example.com',
      executionMode: 'project_command',
      runnerCommand: 'bun run e2e:vacation',
      timeoutSeconds: 600,
    }, admin);

    expect(testCase).toMatchObject({
      suiteId: suite.id,
      roles: ['Employee', 'HR'],
      runnerCommand: 'bun run e2e:vacation',
      executionMode: 'project_command',
      latestRun: null,
    });
    const withAsset = await e2e.addE2eCaseAssets(testCase.id, [{
      fileName: 'vacation-import.csv', mimeType: 'text/csv', data: Buffer.from('employee,start,end\nAnna,2026-09-10,2026-09-12'),
    }], member);
    const assetId = withAsset.assets[0]!.id;

    const queued = e2e.queueE2eCase(testCase.id, { targetRevision: 'abc123' }, member);
    expect(queued).toMatchObject({ status: 'queued', targetRevision: 'abc123', triggerType: 'manual' });
    expect(queued.definition).toMatchObject({
      title: 'Employee vacation request',
      roles: ['Employee', 'HR'],
      runnerCommand: 'bun run e2e:vacation',
    });
    expect(queued).not.toHaveProperty('definitionSnapshot');
    expect(testCase).not.toHaveProperty('rolesJson');
    await expect(e2e.deleteE2eCaseAsset(assetId, member)).rejects.toMatchObject({ statusMessage: 'e2e_case_running' });
    expectStatusMessage(() => e2e.queueE2eCase(testCase.id, {}, member), 'e2e_case_already_running');

    const catalog = e2e.listProjectE2e(projectId, member);
    expect(catalog.suites).toHaveLength(1);
    expect(catalog.cases[0]?.latestRun).toMatchObject({ id: queued.id, status: 'queued' });
    expectStatusMessage(() => e2e.listProjectE2e(projectId, outsider), 'project_forbidden');
  });

  test('reserves arbitrary project command changes for administrators', () => {
    const suite = e2e.createE2eSuite(projectId, { name: 'Trusted project runners' }, admin);
    expectStatusMessage(() => e2e.createE2eCase(projectId, {
      suiteId: suite.id,
      title: 'Untrusted command',
      executionMode: 'project_command',
      runnerCommand: 'env',
    }, member), 'e2e_project_command_admin_required');
  });

  test('makes browser journeys the default and requires a complete observable contract', () => {
    const suite = e2e.createE2eSuite(projectId, { name: 'Role journeys' }, admin);
    const draft = e2e.createE2eCase(projectId, {
      suiteId: suite.id,
      title: 'Incomplete role journey',
    }, admin);
    expect(draft).toMatchObject({ executionMode: 'browser_harness', agentHarness: 'codex', reasoningEffort: 'xhigh' });
    expectStatusMessage(() => e2e.queueE2eCase(draft.id, {}, admin), 'e2e_browser_definition_incomplete');

    const journey = e2e.createE2eCase(projectId, {
      suiteId: suite.id,
      title: 'CEO company setup',
      scenario: 'Create the company and invite HR.',
      expectedResult: 'The company dashboard is visible and HR has a pending invitation.',
      targetUrl: 'https://test.example.com/onboarding',
      roles: ['CEO', 'HR'],
      agentHarness: 'prime-agent',
      reasoningEffort: 'medium',
    }, admin);
    const run = e2e.queueE2eCase(journey.id, {}, admin);
    expect(run).toMatchObject({ executionMode: 'browser_harness', agentHarness: 'prime-agent' });
    expect(run.definition).toMatchObject({
      executionMode: 'browser_harness', agentHarness: 'prime-agent', reasoningEffort: 'medium', roles: ['CEO', 'HR'],
    });
  });

  test('enforces optimistic edits and protects non-empty suites', () => {
    const catalog = e2e.listProjectE2e(projectId, admin);
    const suite = catalog.suites[0]!;
    const testCase = catalog.cases[0]!;
    const updated = e2e.updateE2eCase(testCase.id, {
      expectedResult: 'The request is pending, visible in the calendar, and contains Nina as substitute.',
      expectedUpdatedAt: testCase.updatedAt,
    }, admin);
    expect(updated.expectedResult).toContain('Nina');
    expectStatusMessage(() => e2e.updateE2eCase(testCase.id, {
      title: 'Stale title', expectedUpdatedAt: testCase.updatedAt,
    }, member), 'e2e_record_stale');
    expectStatusMessage(() => e2e.deleteE2eSuite(suite.id, member), 'e2e_suite_not_empty');
  });

  test('queues matching task-status triggers once and respects hierarchy filters', async () => {
    const board = kanban.getBoard(projectId, admin);
    const suite = e2e.createE2eSuite(projectId, { name: 'Review checks' }, admin);
    const topic = board.oberthemen[0]!;
    const subtopic = board.unterthemen[0]!;
    const triggered = e2e.createE2eCase(projectId, {
      suiteId: suite.id,
      title: 'Topic review smoke',
      executionMode: 'project_command',
      runnerCommand: 'bun run e2e:review',
      triggerColumnKey: 'in_review',
      triggerOberthemaId: topic.id,
      triggerUnterthemaId: subtopic.id,
    }, admin);
    const task = insertTask(topic.id, subtopic.id, board.columns.find((column) => column.key === 'backlog')!.id);
    await kanban.updateTask(task.id, { columnId: board.columns.find((column) => column.key === 'in_review')!.id }, member);
    const queued = e2e.listProjectE2e(projectId, admin).runs.filter((run) => run.caseId === triggered.id);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ caseId: triggered.id, triggerType: 'task_status', triggerTaskId: task.id });
    expect(e2e.queueE2eForTaskTransition(task, 'in_review', member.id)).toEqual([]);
    expect(e2e.queueE2eForTaskTransition({ ...task, unterthemaId: null }, 'in_review', member.id)).toEqual([]);
  });

  test('persists the separate project E2E concurrency limit', () => {
    const project = kanban.getProject(projectId, admin);
    expect(project.e2eConcurrencyLimit).toBe(3);
  });
});

function insertUser(emailPrefix: string, name: string): User {
  const now = new Date().toISOString();
  const row: User = {
    id: randomUUID(), email: `${emailPrefix}@example.com`, name,
    passwordHash: admin?.passwordHash ?? 'unused', role: 'member', active: true,
    createdAt: now, updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(row).run();
  return row;
}

function insertTask(oberthemaId: string, unterthemaId: string, columnId: string) {
  const now = new Date().toISOString();
  const task: typeof dbModule.schema.tasks.$inferSelect = {
    id: randomUUID(), projectId, oberthemaId, unterthemaId, columnId, swimlaneId: null,
    key: `E2E-${Date.now()}`, title: 'Triggered task', description: null, refinedDescription: null,
    descriptionSource: 'original', priority: 'normal', position: 0, createdBy: admin.id,
    clientRequestId: null, assigneeId: null, agentEnabled: false, agentStatus: 'idle',
    agentHarness: 'codex', reasoningEffort: 'xhigh', createdAt: now, updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.tasks).values(task).run();
  return task;
}

function expectStatusMessage(action: () => unknown, statusMessage: string) {
  try { action(); } catch (error) {
    expect(error).toMatchObject({ statusMessage });
    return;
  }
  throw new Error(`Expected ${statusMessage}`);
}
