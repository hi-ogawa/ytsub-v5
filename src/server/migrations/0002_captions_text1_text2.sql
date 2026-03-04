-- Rework captions: per-language rows → paired text1/text2 (v3-style)
-- SQLite has no ALTER DROP COLUMN, so recreate the table.
-- Existing caption data is dropped (dev/seed only).

DROP INDEX IF EXISTS idx_captions_video;
DROP TABLE IF EXISTS captions;

CREATE TABLE captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  begin REAL NOT NULL,
  end REAL NOT NULL,
  text1 TEXT NOT NULL DEFAULT '',
  text2 TEXT NOT NULL DEFAULT '',
  UNIQUE(video_id, idx)
);

CREATE INDEX idx_captions_video ON captions(video_id);
