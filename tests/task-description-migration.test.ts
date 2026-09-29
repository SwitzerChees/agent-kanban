import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-task-description-migration-'));
const dataDir = path.join(testRoot, 'data');
mkdirSync(dataDir, { recursive: true });
process.env.KANBAN_DATA_DIR = dataDir;

const legacy = new Database(path.join(dataDir, 'kanban.sqlite'));
legacy.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    folder_path TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_de TEXT NOT NULL,
    position INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE oberthemen (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT 'teal',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    oberthema_id TEXT NOT NULL,
    unterthema_id TEXT,
    column_id TEXT NOT NULL,
    swimlane_id TEXT,
    key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    position INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    client_request_id TEXT,
    assignee_id TEXT,
    agent_enabled INTEGER NOT NULL DEFAULT 0,
    agent_status TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE task_refinements (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    requested_by TEXT,
    source_description TEXT,
    source_task_updated_at TEXT,
    result_markdown TEXT,
    applied_at TEXT,
    applied_by TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  INSERT INTO users VALUES (
    'legacy-user', 'legacy@example.com', 'Legacy User', 'hash', 'admin', 1,
    '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
  );
  INSERT INTO projects VALUES (
    'legacy-project', 'LEGACY', 'Legacy Project', NULL, '/tmp/legacy-project', 'legacy-user',
    '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
  );
  INSERT INTO columns VALUES (
    'legacy-column', 'legacy-project', 'backlog', 'Backlog', 'Backlog', 0, 0,
    '2026-07-01T00:00:00.000Z'
  );
  INSERT INTO oberthemen VALUES (
    'legacy-topic', 'legacy-project', 'General', NULL, 'teal', 0,
    '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
  );
  INSERT INTO tasks VALUES (
    'legacy-task', 'legacy-project', 'legacy-topic', NULL, 'legacy-column', NULL,
    'LEGACY-1', 'Preserve both descriptions', 'Applied refinement text', 'normal', 0,
    'legacy-user', NULL, NULL, 0, 'idle',
    '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z'
  );
  INSERT INTO task_refinements VALUES (
    'legacy-refinement', 'legacy-task', 1, 'completed', 'legacy-user',
    'Human original text', '2026-07-01T00:00:00.000Z', 'Applied refinement text',
    '2026-07-02T00:00:00.000Z', 'legacy-user',
    '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z'
  );

  ALTER TABLE tasks ADD COLUMN agent_model TEXT NOT NULL DEFAULT 'gpt-6-sol';
  CREATE TABLE project_chat_threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New chat',
    harness TEXT NOT NULL DEFAULT 'codex',
    agent_model TEXT NOT NULL DEFAULT 'gpt-6-sol',
    reasoning_effort TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'ready',
    is_current INTEGER NOT NULL DEFAULT 0,
    native_session_id TEXT,
    source_revision TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE project_chat_preferences (
    user_id TEXT PRIMARY KEY,
    harness TEXT NOT NULL DEFAULT 'codex',
    agent_model TEXT NOT NULL DEFAULT 'gpt-6-sol',
    reasoning_effort TEXT NOT NULL DEFAULT 'low',
    updated_at TEXT NOT NULL
  );
  INSERT INTO project_chat_threads (id, project_id, user_id, agent_model, created_at, updated_at)
  VALUES ('legacy-chat', 'legacy-project', 'legacy-user', 'gpt-6-sol',
    '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z');
  INSERT INTO project_chat_preferences (user_id, agent_model, updated_at)
  VALUES ('legacy-user', 'gpt-6-sol', '2026-07-02T00:00:00.000Z');
`);
legacy.close();

let dbModule: typeof import('../server/lib/db');

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('task description separation migration', () => {
  test('restores the human source and keeps the applied refinement active', () => {
    const task = dbModule.db.select().from(dbModule.schema.tasks).get();
    expect(task).toMatchObject({
      id: 'legacy-task',
      description: 'Human original text',
      refinedDescription: 'Applied refinement text',
      descriptionSource: 'refined',
      agentModel: 'gpt-6.1-sol',
    });
  });

  test('moves saved Codex Sol selections to GPT-6.1 Sol', () => {
    for (const table of ['tasks', 'project_chat_threads', 'project_chat_preferences']) {
      const row = dbModule.sqliteDatabase.prepare(`SELECT agent_model FROM ${table}`).get() as { agent_model: string };
      expect(row.agent_model).toBe('gpt-6.1-sol');
    }
  });
});
