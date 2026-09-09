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
`;
