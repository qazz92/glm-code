-- Meta table (schema version tracking)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  cwd           TEXT NOT NULL,
  worktree      TEXT NOT NULL,
  initial_task  TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active, updated_at);

-- Messages (one row per turn entry)
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  parent_id     TEXT,
  role          TEXT NOT NULL,
  ts            TEXT NOT NULL,
  content       BLOB NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, ts);

-- Events (debug log persistence)
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  session_id    TEXT,
  topic         TEXT NOT NULL,
  data          BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_topic_ts ON events(topic, ts);
