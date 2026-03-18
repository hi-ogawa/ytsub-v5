CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_name TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  language1 TEXT NOT NULL,
  language2 TEXT NOT NULL,
  vss_id1 TEXT NOT NULL DEFAULT '',
  vss_id2 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, youtube_id)
);

CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);

CREATE TABLE IF NOT EXISTS captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  begin REAL NOT NULL,
  end REAL NOT NULL,
  text1 TEXT NOT NULL DEFAULT '',
  text2 TEXT NOT NULL DEFAULT '',
  UNIQUE(video_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_captions_video ON captions(video_id);

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
  etymology TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_video ON bookmarks(video_id);
