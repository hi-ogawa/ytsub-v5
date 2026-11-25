-- Deleting a caption sets its bookmarks' caption_id to NULL, and without this
-- index SQLite scans every bookmark for each deleted caption.
CREATE INDEX IF NOT EXISTS idx_bookmarks_caption ON bookmarks(caption_id);
