-- Quota usage tracking
CREATE TABLE IF NOT EXISTS quota_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pool          TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  ts            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quota_usage_pool_ts ON quota_usage(pool, ts);

-- Quota pools (limits per pool)
CREATE TABLE IF NOT EXISTS quota_pools (
  pool          TEXT PRIMARY KEY,
  budget_input  INTEGER NOT NULL DEFAULT 0,
  budget_output INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL
);
