CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel_name TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  language1 TEXT NOT NULL DEFAULT 'ko',
  language2 TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  idx INTEGER NOT NULL,
  begin REAL NOT NULL,
  end REAL NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(video_id, language, idx)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  caption_id INTEGER REFERENCES captions(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  side INTEGER NOT NULL DEFAULT 0,
  offset INTEGER NOT NULL DEFAULT 0,
  translation TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  timestamp REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_captions_video ON captions(video_id, language);
CREATE INDEX IF NOT EXISTS idx_bookmarks_video ON bookmarks(video_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(status);
