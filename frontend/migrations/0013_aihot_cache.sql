-- Cache only after the operator has obtained AIHOT written authorization.
-- Never publish a raw JSON proxy or historic AIHOT archive.
CREATE TABLE IF NOT EXISTS aihot_cache (
  kind TEXT PRIMARY KEY CHECK (kind IN ('hot', 'daily', 'weekly')),
  etag TEXT,
  payload TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0
);
