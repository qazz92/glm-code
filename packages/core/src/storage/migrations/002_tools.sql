CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','cancelled')),
  active_form TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_todos_session_status ON todos(session_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_session_position ON todos(session_id, position);

CREATE TABLE IF NOT EXISTS tool_call_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool TEXT NOT NULL,
  params_json TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error_code TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_call_log_session ON tool_call_log(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_call_log_tool ON tool_call_log(tool, created_at);
