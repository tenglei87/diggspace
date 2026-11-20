-- A standalone, read-only public RSS news aggregator. Previous tables
-- remain untouched for safe rollback, but the new Worker never queries them.
CREATE TABLE IF NOT EXISTS news_sources (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  etag TEXT,
  last_modified TEXT,
  last_checked_at INTEGER,
  last_ok_at INTEGER,
  next_check_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS news_sources_due ON news_sources(enabled, next_check_at);

CREATE TABLE IF NOT EXISTS news_items (
  source_id TEXT NOT NULL REFERENCES news_sources(id),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  published_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY(source_id, url)
);
CREATE INDEX IF NOT EXISTS news_items_by_date ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_by_source_date ON news_items(source_id, published_at DESC);

CREATE TABLE IF NOT EXISTS news_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
