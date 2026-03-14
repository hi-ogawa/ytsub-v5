-- Add updated_at to videos for sync state tracking
-- SQLite ALTER TABLE ADD COLUMN requires a constant default
ALTER TABLE videos ADD COLUMN updated_at TEXT;
-- Backfill existing rows with created_at
UPDATE videos SET updated_at = created_at WHERE updated_at IS NULL;
