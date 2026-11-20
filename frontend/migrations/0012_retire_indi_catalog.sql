-- Retire the one-time Indi-derived 1609-blog directory.
-- Keep historical rows/posts for referential integrity, but deactivate
-- subscriptions and exclude all retired content from the public UI.
-- Manually created or adopted sources are never affected by this update.
INSERT OR IGNORE INTO source_groups (id, name, sort_order)
VALUES ('feeds', '订阅源', 0);

UPDATE blogs
SET removed = 1,
    feed = NULL,
    source_origin = 'retired_catalog',
    next_check_at = NULL
WHERE source_origin = 'csv';

-- Any manually adopted old blog stays subscribed but no longer uses
-- the retired "blogs" source group.
UPDATE blogs SET source_group = 'feeds'
WHERE source_group = 'blogs' AND source_origin != 'retired_catalog';

DELETE FROM source_groups WHERE id = 'blogs';

-- The migration changes active source membership. Discard old SSR cache data;
-- refresh the snapshot via the protected endpoint after deploying the Worker.
DELETE FROM meta WHERE key IN ('snapshot', 'stats');
