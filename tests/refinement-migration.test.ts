import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-refinement-migration-'));
const dataDir = path.join(testRoot, 'data');
mkdirSync(dataDir, { recursive: true });
process.env.KANBAN_DATA_DIR = dataDir;
process.env.KANBAN_ADMIN_EMAIL = 'refinement-migration@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'refinement-migration-password';

const partial = new Database(path.join(dataDir, 'kanban.sqlite'));
partial.exec(`
  CREATE TABLE task_refinements (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    requested_by TEXT,
    source_task_updated_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  INSERT INTO task_refinements (
    id, task_id, version, status, requested_by, source_task_updated_at, created_at, updated_at
  ) VALUES (
    'partial-refinement', 'missing-task', 1, 'completed', NULL, '2026-07-15T00:00:00.000Z',
    '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  );
  INSERT INTO task_refinements (
    id, task_id, version, status, requested_by, source_task_updated_at, created_at, updated_at
  ) VALUES
    ('partial-active-a', 'active-task', 1, 'running', NULL, '2026-07-15T00:00:00.000Z', '2026-07-15T01:00:00.000Z', '2026-07-15T01:00:00.000Z'),
    ('partial-active-b', 'active-task', 1, 'queued', NULL, '2026-07-15T00:00:00.000Z', '2026-07-15T02:00:00.000Z', '2026-07-15T02:00:00.000Z');
`);
partial.close();

let dbModule: typeof import('../server/lib/db');

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('refinement schema migration', () => {
  test('fills every column added after an intermediate task_refinements table', () => {
    const sqlite = new Database(path.join(dataDir, 'kanban.sqlite'), { readonly: true });
    try {
      const columns = new Set(
        (sqlite.prepare('PRAGMA table_info(task_refinements)').all() as Array<{ name: string }>).map((column) => column.name),
      );
      expect([...columns]).toEqual(expect.arrayContaining([
        'brief',
        'visual_mode',
        'source_description',
        'source_code_revision',
        'result_code_revision',
        'questions_json',
        'round',
        'result_markdown',
        'result_json',
        'complexity',
        'visuals_json',
        'thread_id',
        'lease_owner',
        'lease_token',
        'lease_expires_at',
        'heartbeat_at',
        'error',
        'started_at',
        'awaiting_input_at',
        'completed_at',
        'failed_at',
        'applied_at',
        'applied_by',
      ]));
      const orphanCount = sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM task_refinements
        WHERE task_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_refinements.task_id)
           OR requested_by IS NULL
           OR NOT EXISTS (SELECT 1 FROM users WHERE users.id = task_refinements.requested_by)
           OR source_task_updated_at IS NULL
      `).get() as { count: number };
      expect(orphanCount.count).toBe(0);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM task_refinements').get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }

    expect(dbModule.schema.taskRefinements.resultCodeRevision.name).toBe('result_code_revision');
  });
});
