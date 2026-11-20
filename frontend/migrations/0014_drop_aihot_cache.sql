-- Retire the now-removed third-party AIHOT integration.
-- Migration 0013 remains in source control as historical migration state;
-- this migration removes its data and table without affecting RSS sources.
DROP TABLE IF EXISTS aihot_cache;
