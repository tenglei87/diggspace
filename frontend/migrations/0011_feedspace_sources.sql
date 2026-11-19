-- FeedSpace source groups. Original CSV-managed rows remain independent blogs.
CREATE TABLE source_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100
);
INSERT INTO source_groups (id, name, sort_order) VALUES ('blogs', '独立博客', 0);

ALTER TABLE blogs ADD COLUMN source_group TEXT NOT NULL DEFAULT 'blogs';
ALTER TABLE blogs ADD COLUMN source_origin TEXT NOT NULL DEFAULT 'csv';

CREATE INDEX blogs_source_group ON blogs (source_group, removed);
CREATE INDEX blogs_source_origin ON blogs (source_origin, removed);
