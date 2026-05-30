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
      column_id TEXT NOT NULL REFERENCES columns(id),
      swimlane_id TEXT REFERENCES swimlanes(id),
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      position INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      assignee_id TEXT REFERENCES users(id),
      agent_status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_project_tags_project ON project_tags(project_id);
    CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
  `);

  sqlite.exec(`
    UPDATE columns SET name_de = 'In Prüfung' WHERE key = 'in_review' AND name_de = 'In Pruefung';
  `);

  const commentColumns = sqlite.prepare('PRAGMA table_info(comments)').all() as Array<{ name: string }>;
  if (!commentColumns.some((column) => column.name === 'kind')) {
    sqlite.exec("ALTER TABLE comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'steering';");
  }

  sqlite.exec(`
    INSERT OR IGNORE INTO project_tags (project_id, name, created_at)
    SELECT tasks.project_id, task_tags.name, MIN(task_tags.created_at)
    FROM task_tags
    INNER JOIN tasks ON tasks.id = task_tags.task_id
    GROUP BY tasks.project_id, task_tags.name;
  `);

  seedAdmin();
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
