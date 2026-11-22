-- When the video's content was last edited, on whichever side the edit
-- happened. Clients set it on push, and the server sets it for its own edits.
-- Stored as an ISO string with milliseconds, returned exactly as written.
ALTER TABLE videos ADD COLUMN edited_at TEXT NOT NULL DEFAULT '';

UPDATE videos SET edited_at = replace(updated_at, ' ', 'T') || '.000Z';
