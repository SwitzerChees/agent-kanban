import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { count } from 'drizzle-orm';
import * as schema from './schema';
import { hashPassword } from '../security/password';
import { runtimeLogger } from '../logger';

const dataDir = path.resolve(process.cwd(), process.env.KANBAN_DATA_DIR ?? '.data');
const dbPath = path.join(dataDir, 'kanban.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

let initialized = false;

export function ensureDatabase() {
  if (initialized) return;
  initialized = true;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      folder_path TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_users (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS project_tags (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_de TEXT NOT NULL,
      position INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oberthemen (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT 'teal',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS unterthemen (
      id TEXT PRIMARY KEY,
      oberthema_id TEXT NOT NULL REFERENCES oberthemen(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(oberthema_id, name)
    );

    CREATE TABLE IF NOT EXISTS swimlanes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name_en TEXT NOT NULL,
      name_de TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      oberthema_id TEXT NOT NULL REFERENCES oberthemen(id),
      unterthema_id TEXT REFERENCES unterthemen(id),
      column_id TEXT NOT NULL REFERENCES columns(id),
      swimlane_id TEXT REFERENCES swimlanes(id),
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      refined_description TEXT,
      description_source TEXT NOT NULL DEFAULT 'original',
      priority TEXT NOT NULL DEFAULT 'normal',
      position INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      client_request_id TEXT,
      assignee_id TEXT REFERENCES users(id),
      agent_enabled INTEGER NOT NULL DEFAULT 0,
      agent_status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_refinements (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      requested_by TEXT NOT NULL REFERENCES users(id),
      brief TEXT,
      visual_mode TEXT NOT NULL DEFAULT 'auto',
      source_description TEXT,
      source_task_updated_at TEXT NOT NULL,
      source_code_revision TEXT,
      result_code_revision TEXT,
      questions_json TEXT NOT NULL DEFAULT '[]',
      round INTEGER NOT NULL DEFAULT 1,
      result_markdown TEXT,
      result_json TEXT,
      complexity TEXT,
      visuals_json TEXT NOT NULL DEFAULT '[]',
      thread_id TEXT,
      lease_owner TEXT,
      lease_token TEXT,
      lease_expires_at TEXT,
      heartbeat_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      awaiting_input_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      applied_at TEXT,
      applied_by TEXT REFERENCES users(id),
      updated_at TEXT NOT NULL,
      UNIQUE(task_id, version)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(task_id, name)
    );

    CREATE TABLE IF NOT EXISTS attachment_annotations (
      attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
      annotation_data TEXT NOT NULL,
      rendered_storage_path TEXT NOT NULL,
      updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL DEFAULT 'comment',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comment_mentions (
      comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      seen_at TEXT,
      PRIMARY KEY(comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id);
    CREATE INDEX IF NOT EXISTS idx_oberthemen_project ON oberthemen(project_id);
    CREATE INDEX IF NOT EXISTS idx_unterthemen_oberthema ON unterthemen(oberthema_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_project_tags_project ON project_tags(project_id);
    CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_comment_mentions_task_user ON comment_mentions(task_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_comment_mentions_unread ON comment_mentions(user_id, seen_at);
    CREATE INDEX IF NOT EXISTS idx_activity_task_created ON activity(task_id, created_at);
  `);

  // Older builds persisted the complete Codex protocol stream, including
  // command-output deltas. Those internal diagnostics reached tens of
  // megabytes per task and were never part of the user-facing history.
  const removedRawCodexEvents = sqlite.prepare("DELETE FROM activity WHERE action = 'codex_event'").run().changes;
  if (removedRawCodexEvents > 0) {
    runtimeLogger.info('removed legacy raw codex activity', { rows: removedRawCodexEvents });
  }

  sqlite.exec(`
    UPDATE columns SET name_de = 'In Prüfung' WHERE key = 'in_review' AND name_de = 'In Pruefung';
  `);

  const commentColumns = sqlite.prepare('PRAGMA table_info(comments)').all() as Array<{ name: string }>;
  if (!commentColumns.some((column) => column.name === 'kind')) {
    sqlite.exec("ALTER TABLE comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'steering';");
  }

  const taskColumns = sqlite.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
  if (!taskColumns.some((column) => column.name === 'unterthema_id')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN unterthema_id TEXT REFERENCES unterthemen(id);');
  }
  if (!taskColumns.some((column) => column.name === 'oberthema_id')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN oberthema_id TEXT REFERENCES oberthemen(id);');
  }
  if (!taskColumns.some((column) => column.name === 'agent_enabled')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN agent_enabled INTEGER NOT NULL DEFAULT 0;');
    sqlite.exec("UPDATE tasks SET agent_status = 'idle' WHERE agent_status = 'queued';");
  }
  if (!taskColumns.some((column) => column.name === 'client_request_id')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN client_request_id TEXT;');
  }
  if (!taskColumns.some((column) => column.name === 'refined_description')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN refined_description TEXT;');
  }
  if (!taskColumns.some((column) => column.name === 'description_source')) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN description_source TEXT NOT NULL DEFAULT 'original';");
  }
  sqlite.exec(`
    UPDATE tasks
    SET description_source = 'original'
    WHERE description_source NOT IN ('original', 'refined')
       OR description_source IS NULL;
  `);
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_client_request
    ON tasks(project_id, created_by, client_request_id)
    WHERE client_request_id IS NOT NULL;
  `);

  // `task_refinements` was introduced without a migration framework. Keep the
  // bootstrap idempotent for databases created by development/intermediate
  // builds where later lifecycle, result, or revision columns may be missing.
  const refinementColumns = new Set(
    (sqlite.prepare('PRAGMA table_info(task_refinements)').all() as Array<{ name: string }>).map((column) => column.name),
  );
  const addRefinementColumn = (name: string, definition: string) => {
    if (refinementColumns.has(name)) return;
    sqlite.exec(`ALTER TABLE task_refinements ADD COLUMN ${name} ${definition};`);
    refinementColumns.add(name);
  };
  addRefinementColumn('version', 'INTEGER NOT NULL DEFAULT 1');
  addRefinementColumn('status', "TEXT NOT NULL DEFAULT 'queued'");
  addRefinementColumn('requested_by', 'TEXT REFERENCES users(id)');
  addRefinementColumn('brief', 'TEXT');
  addRefinementColumn('visual_mode', "TEXT NOT NULL DEFAULT 'auto'");
  addRefinementColumn('source_description', 'TEXT');
  addRefinementColumn('source_task_updated_at', 'TEXT');
  addRefinementColumn('source_code_revision', 'TEXT');
  addRefinementColumn('result_code_revision', 'TEXT');
  addRefinementColumn('questions_json', "TEXT NOT NULL DEFAULT '[]'");
  addRefinementColumn('round', 'INTEGER NOT NULL DEFAULT 1');
  addRefinementColumn('result_markdown', 'TEXT');
  addRefinementColumn('result_json', 'TEXT');
  addRefinementColumn('complexity', 'TEXT');
  addRefinementColumn('visuals_json', "TEXT NOT NULL DEFAULT '[]'");
  addRefinementColumn('thread_id', 'TEXT');
  addRefinementColumn('lease_owner', 'TEXT');
  addRefinementColumn('lease_token', 'TEXT');
  addRefinementColumn('lease_expires_at', 'TEXT');
  addRefinementColumn('heartbeat_at', 'TEXT');
  addRefinementColumn('error', 'TEXT');
  addRefinementColumn('created_at', 'TEXT');
  addRefinementColumn('started_at', 'TEXT');
  addRefinementColumn('awaiting_input_at', 'TEXT');
  addRefinementColumn('completed_at', 'TEXT');
  addRefinementColumn('failed_at', 'TEXT');
  addRefinementColumn('applied_at', 'TEXT');
  addRefinementColumn('applied_by', 'TEXT REFERENCES users(id)');
  addRefinementColumn('updated_at', 'TEXT');

  const refinementMigrationNow = new Date().toISOString();
  sqlite.prepare(`
    UPDATE task_refinements
    SET requested_by = COALESCE(
      requested_by,
      (SELECT tasks.created_by FROM tasks WHERE tasks.id = task_refinements.task_id)
    ),
    source_task_updated_at = COALESCE(
      source_task_updated_at,
      (SELECT tasks.updated_at FROM tasks WHERE tasks.id = task_refinements.task_id),
      created_at,
      ?
    ),
    source_description = COALESCE(
      source_description,
      (SELECT tasks.description FROM tasks WHERE tasks.id = task_refinements.task_id)
    ),
    created_at = COALESCE(created_at, ?),
    updated_at = COALESCE(updated_at, created_at, ?),
    questions_json = COALESCE(questions_json, '[]'),
    visuals_json = COALESCE(visuals_json, '[]'),
    round = COALESCE(round, 1),
    visual_mode = COALESCE(visual_mode, 'auto'),
    status = COALESCE(status, 'queued')
  `).run(refinementMigrationNow, refinementMigrationNow, refinementMigrationNow);

  // Rows whose task or requester no longer exists cannot satisfy the runtime
  // invariants and cannot be repaired without inventing ownership. Quarantine
  // them by removing them before Drizzle reads the table as NOT NULL/FK-safe.
  sqlite.exec(`
    DELETE FROM task_refinements
    WHERE task_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_refinements.task_id)
       OR requested_by IS NULL
       OR NOT EXISTS (SELECT 1 FROM users WHERE users.id = task_refinements.requested_by)
       OR source_task_updated_at IS NULL;
  `);

  sqlite.exec(`
    WITH duplicate_tasks AS (
      SELECT task_id
      FROM task_refinements
      GROUP BY task_id, version
      HAVING COUNT(*) > 1
    ), ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY task_id
               ORDER BY version, created_at, id
             ) AS normalized_version
      FROM task_refinements
      WHERE task_id IN (SELECT task_id FROM duplicate_tasks)
    )
    UPDATE task_refinements
    SET version = (
      SELECT ranked.normalized_version
      FROM ranked
      WHERE ranked.id = task_refinements.id
    )
    WHERE id IN (SELECT id FROM ranked);
  `);

  // A partial development build could have missed the active-run index. Keep
  // the newest run active and close older duplicates before restoring it.
  sqlite.prepare(`
    UPDATE task_refinements AS current
    SET status = 'failed',
        error = 'refinement_failed',
        failed_at = COALESCE(failed_at, ?),
        updated_at = ?
    WHERE current.status IN ('queued', 'running', 'awaiting_input')
      AND EXISTS (
        SELECT 1
        FROM task_refinements AS newer
        WHERE newer.task_id = current.task_id
          AND newer.status IN ('queued', 'running', 'awaiting_input')
          AND (
            newer.version > current.version
            OR (newer.version = current.version AND newer.created_at > current.created_at)
            OR (newer.version = current.version AND newer.created_at = current.created_at AND newer.id > current.id)
          )
      )
  `).run(refinementMigrationNow, refinementMigrationNow);
  sqlite.exec(`
    UPDATE task_refinements
    SET error = CASE
      WHEN status = 'failed' AND error IN (
        'refinement_timeout',
        'refinement_invalid_output',
        'refinement_security_policy',
        'refinement_question_limit',
        'refinement_failed'
      ) THEN error
      WHEN status = 'failed' THEN 'refinement_failed'
      ELSE NULL
    END;
  `);
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_refinements_version ON task_refinements(task_id, version);
    CREATE INDEX IF NOT EXISTS idx_task_refinements_task ON task_refinements(task_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_task_refinements_status ON task_refinements(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_refinements_lease
      ON task_refinements(status, lease_expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_refinements_active
      ON task_refinements(task_id)
      WHERE status IN ('queued', 'running', 'awaiting_input');
  `);

  // Older versions replaced tasks.description when a refinement was applied.
  // Preserve that current text as the refined variant and restore the first
  // human-authored source snapshot as the task's original description. The
  // refined_description predicate makes this migration safe to rerun after a
  // user deliberately switches the active source back to the original.
  sqlite.exec(`
    UPDATE tasks
    SET refined_description = description,
        description = (
          SELECT first_applied.source_description
          FROM task_refinements AS first_applied
          WHERE first_applied.task_id = tasks.id
            AND first_applied.applied_at IS NOT NULL
          ORDER BY first_applied.version ASC, first_applied.applied_at ASC
          LIMIT 1
        ),
        description_source = 'refined'
    WHERE refined_description IS NULL
      AND EXISTS (
        SELECT 1
        FROM task_refinements AS applied
        WHERE applied.task_id = tasks.id
          AND applied.applied_at IS NOT NULL
      );
  `);

  ensureTaskHierarchy();

  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_tasks_unterthema ON tasks(unterthema_id);');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_tasks_oberthema ON tasks(oberthema_id);');

  sqlite.exec(`
    INSERT OR IGNORE INTO project_tags (project_id, name, created_at)
    SELECT tasks.project_id, task_tags.name, MIN(task_tags.created_at)
    FROM task_tags
    INNER JOIN tasks ON tasks.id = task_tags.task_id
    GROUP BY tasks.project_id, task_tags.name;
  `);

  seedAdmin();
}

export function ensureTaskHierarchy() {
  const hierarchyNow = new Date().toISOString();
  const createDefaultHierarchy = sqlite.transaction(() => {
    const projectRows = sqlite.prepare('SELECT id FROM projects').all() as Array<{ id: string }>;
    const findOberthema = sqlite.prepare('SELECT id FROM oberthemen WHERE project_id = ? ORDER BY position, created_at LIMIT 1');
    const insertOberthema = sqlite.prepare(`
      INSERT INTO oberthemen (id, project_id, name, description, color, position, created_at, updated_at)
      VALUES (?, ?, 'Allgemein', 'Migrierte Aufgaben und allgemeine Projektarbeit', 'teal', 0, ?, ?)
    `);
    const findUnterthema = sqlite.prepare(`
      SELECT unterthemen.id
      FROM unterthemen
      INNER JOIN oberthemen ON oberthemen.id = unterthemen.oberthema_id
      WHERE oberthemen.project_id = ?
      ORDER BY oberthemen.position, unterthemen.position, unterthemen.created_at
      LIMIT 1
    `);
    const insertUnterthema = sqlite.prepare(`
      INSERT INTO unterthemen (id, oberthema_id, name, description, position, created_at, updated_at)
      VALUES (?, ?, 'Allgemeine Aufgaben', 'Aufgaben ohne bisherige Themenzuordnung', 0, ?, ?)
    `);
    // Only migrate genuinely legacy tasks that predate both hierarchy columns.
    // A current direct task deliberately has an oberthema_id and a null
    // unterthema_id and must stay directly inside its selected parent topic.
    const assignTasks = sqlite.prepare(`
      UPDATE tasks
      SET unterthema_id = ?
      WHERE project_id = ?
        AND unterthema_id IS NULL
        AND oberthema_id IS NULL
    `);

    for (const project of projectRows) {
      let oberthema = findOberthema.get(project.id) as { id: string } | undefined;
      if (!oberthema) {
        oberthema = { id: randomUUID() };
        insertOberthema.run(oberthema.id, project.id, hierarchyNow, hierarchyNow);
      }
      let unterthema = findUnterthema.get(project.id) as { id: string } | undefined;
      if (!unterthema) {
        unterthema = { id: randomUUID() };
        insertUnterthema.run(unterthema.id, oberthema.id, hierarchyNow, hierarchyNow);
      }
      assignTasks.run(unterthema.id, project.id);
    }
  });
  createDefaultHierarchy();

  sqlite.exec(`
    UPDATE tasks
    SET oberthema_id = (
      SELECT unterthemen.oberthema_id
      FROM unterthemen
      WHERE unterthemen.id = tasks.unterthema_id
    )
    WHERE oberthema_id IS NULL;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_tasks_hierarchy_insert
    BEFORE INSERT ON tasks
    WHEN NEW.unterthema_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unterthemen
        INNER JOIN oberthemen ON oberthemen.id = unterthemen.oberthema_id
        WHERE unterthemen.id = NEW.unterthema_id
          AND unterthemen.oberthema_id = NEW.oberthema_id
          AND oberthemen.project_id = NEW.project_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'invalid_task_hierarchy');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_tasks_hierarchy_update
    BEFORE UPDATE OF project_id, oberthema_id, unterthema_id ON tasks
    WHEN NEW.unterthema_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unterthemen
        INNER JOIN oberthemen ON oberthemen.id = unterthemen.oberthema_id
        WHERE unterthemen.id = NEW.unterthema_id
          AND unterthemen.oberthema_id = NEW.oberthema_id
          AND oberthemen.project_id = NEW.project_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'invalid_task_hierarchy');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_unterthemen_parent_task_sync
    AFTER UPDATE OF oberthema_id ON unterthemen
    WHEN OLD.oberthema_id <> NEW.oberthema_id
    BEGIN
      UPDATE tasks
      SET oberthema_id = NEW.oberthema_id
      WHERE unterthema_id = NEW.id;
    END;
  `);
}

export function appDataDir(...parts: string[]) {
  const target = path.join(dataDir, ...parts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

function seedAdmin() {
  const existing = db.select({ value: count() }).from(schema.users).get()?.value ?? 0;
  if (existing > 0) return;

  const now = new Date().toISOString();
  const email = process.env.KANBAN_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.KANBAN_ADMIN_PASSWORD ?? 'adminadmin';
  db.insert(schema.users).values({
    id: randomUUID(),
    email,
    name: 'Admin',
    passwordHash: hashPassword(password),
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now,
  }).run();
  runtimeLogger.info('seeded admin user', { email, default_password: process.env.KANBAN_ADMIN_PASSWORD ? '[env]' : 'adminadmin' });
}

ensureDatabase();

export { schema };
