import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { WorkflowEvidence } from '../server/lib/github-quality';

const root = mkdtempSync(path.join(tmpdir(), 'kanban-wait-observer-'));
process.env.KANBAN_DATA_DIR = root;
process.env.KANBAN_ADMIN_EMAIL = 'wait-test@example.invalid';
process.env.KANBAN_ADMIN_PASSWORD = 'disposable-test-password';
let database: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let dispatcher: typeof import('../server/lib/local-dispatcher');
beforeAll(async () => {
  database = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  dispatcher = await import('../server/lib/local-dispatcher');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test('persists the target, throttles probes and resumes immediately after success across restart', async () => {
  const { db, schema } = database;
  const admin = db.select().from(schema.users).get()!;
  const project = await kanban.createProject({ name: 'Wait observer', key: 'WAIT', folderPath: path.join(root, 'repo') }, admin);
  const task = await kanban.createTask(project.id, { title: 'Await TEST', agentEnabled: true }, admin);
  const now = new Date().toISOString();
  const target = { kind: 'deployment', workflow: 'cd-test.yml', commit: 'a'.repeat(40), branch: 'master', pullRequest: 1, createdAt: now };
  db.update(schema.tasks).set({ agentStatus: 'waiting_external' }).where(eq(schema.tasks.id, task.id)).run();
  db.insert(schema.taskAgentRuns).values({ id: 'wait-run', taskId: task.id, harness: 'codex', status: 'waiting_external',
    waitKind: 'deployment', waitTarget: JSON.stringify(target), resumeAt: new Date(Date.now() - 1000).toISOString(),
    createdAt: now, startedAt: now, updatedAt: now }).run();
  const probe = vi.fn<() => Promise<WorkflowEvidence>>().mockResolvedValue({ status: 'pending' });
  const observer = new dispatcher.LocalTaskDispatcher(probe);
  await observer.wakeDueExternalWaits();
  await observer.wakeDueExternalWaits();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('waiting_external');
  // A new instance reloads the persisted target and ignores the old five-minute timer.
  db.update(schema.taskAgentRuns).set({ resumeAt: new Date(Date.now() + 300_000).toISOString() }).where(eq(schema.taskAgentRuns.id, 'wait-run')).run();
  probe.mockResolvedValue({ status: 'success', runId: 42, commit: target.commit, completedAt: now });
  const restarted = new dispatcher.LocalTaskDispatcher(probe);
  await restarted.wakeDueExternalWaits();
  expect(db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).get()?.agentStatus).toBe('queued');
  expect(JSON.parse(db.select().from(schema.taskAgentRuns).where(eq(schema.taskAgentRuns.id, 'wait-run')).get()!.waitResult!)).toMatchObject({ status: 'success', runId: 42 });
  const activity = db.select().from(schema.activity).where(eq(schema.activity.action, 'agent_wait_resumed')).all();
  expect(activity).toHaveLength(1);
  await restarted.wakeDueExternalWaits();
  expect(db.select().from(schema.activity).where(eq(schema.activity.action, 'agent_wait_resumed')).all()).toHaveLength(1);
});
