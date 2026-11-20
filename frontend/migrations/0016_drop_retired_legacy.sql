-- Permanently remove the retired Indi / FeedSpace account and community data.
-- The read-only DiggSpace reader exclusively uses news_sources, news_items,
-- and news_meta (migration 0015). No news_* tables or D1 migration records
-- are modified here. Legacy history must be restored from a D1 checkpoint.
--
-- Drop dependents before parents to preserve foreign-key enforcement.
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS comment_votes;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS blocked_blogs;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS avatars;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS email_codes;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS users;

-- Entire old blog / social catalog is retired; these are not RSS news tables.
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS favicons;
DROP TABLE IF EXISTS source_groups;
DROP TABLE IF EXISTS meta;
DROP TABLE IF EXISTS blogs;
