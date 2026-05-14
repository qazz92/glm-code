-- LLM response cache (session.db)
CREATE TABLE IF NOT EXISTS llm_cache (
  key           TEXT PRIMARY KEY,
  model         TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  request_json  BLOB NOT NULL,
  response_json BLOB NOT NULL,
  usage_input   INTEGER NOT NULL DEFAULT 0,
  usage_output  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_hit_at   TEXT NOT NULL,
  hit_count     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_llm_cache_model ON llm_cache(model);
CREATE INDEX IF NOT EXISTS idx_llm_cache_last_hit ON llm_cache(last_hit_at);
