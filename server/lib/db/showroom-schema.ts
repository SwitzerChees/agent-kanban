export const showroomSchema = `
CREATE TABLE IF NOT EXISTS showroom_shares (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, category TEXT,
 can_comment INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS showroom_blobs (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 hash TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(project_id, hash)
);
CREATE TABLE IF NOT EXISTS showroom_snapshots (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 manifest TEXT NOT NULL, categories TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS showroom_snapshot_project ON showroom_snapshots(project_id);
CREATE TABLE IF NOT EXISTS showroom_previews (
 token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 snapshot_id TEXT NOT NULL REFERENCES showroom_snapshots(id) ON DELETE CASCADE,
 share_id TEXT REFERENCES showroom_shares(id) ON DELETE CASCADE,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS showroom_iterations (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
 source_path TEXT, target_path TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS showroom_feedback (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 snapshot_id TEXT NOT NULL REFERENCES showroom_snapshots(id), view_path TEXT NOT NULL,
 view_hash TEXT NOT NULL, share_id TEXT REFERENCES showroom_shares(id) ON DELETE SET NULL,
 author_name TEXT NOT NULL, body TEXT NOT NULL, anchor TEXT,
 status TEXT NOT NULL DEFAULT 'open', task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
 request_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(project_id, request_id)
);
CREATE INDEX IF NOT EXISTS showroom_feedback_project ON showroom_feedback(project_id, created_at);
CREATE TABLE IF NOT EXISTS task_showroom_links (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('category', 'view')),
 target_path TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'follow' CHECK(mode IN ('follow', 'pinned')),
 snapshot_id TEXT REFERENCES showroom_snapshots(id) ON DELETE SET NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(task_id, kind, target_path)
);
CREATE INDEX IF NOT EXISTS idx_task_showroom_links_task ON task_showroom_links(task_id, created_at);
CREATE TABLE IF NOT EXISTS task_showroom_specs (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, snapshot_id TEXT NOT NULL REFERENCES showroom_snapshots(id),
 entries_json TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 UNIQUE(task_id, version)
);
CREATE INDEX IF NOT EXISTS idx_task_showroom_specs_task ON task_showroom_specs(task_id, version DESC);
`;
