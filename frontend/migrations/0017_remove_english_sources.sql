-- Retire all English-only subscriptions and their cached articles.
-- Items must be deleted first because news_items.source_id is a foreign key.
DELETE FROM news_items WHERE source_id IN (
  SELECT id FROM news_sources WHERE category = 'english'
);
DELETE FROM news_sources WHERE category = 'english';
