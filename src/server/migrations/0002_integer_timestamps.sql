PRAGMA foreign_keys=OFF;

CREATE TABLE users__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO users__new (id, username, password_hash, created_at)
SELECT
  id,
  username,
  password_hash,
  CAST(strftime('%s', created_at) AS INTEGER)
FROM users;

CREATE TABLE videos__new (
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

INSERT INTO videos__new (
  id,
  user_id,
  youtube_id,
  title,
  channel_name,
  channel_id,
  duration,
  language1,
  language2,
  vss_id1,
  vss_id2,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  youtube_id,
  title,
  channel_name,
  channel_id,
  duration,
  language1,
  language2,
  vss_id1,
  vss_id2,
  CAST(strftime('%s', created_at) AS INTEGER),
  CAST(strftime('%s', updated_at) AS INTEGER)
FROM videos;

CREATE TABLE bookmarks__new (
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

INSERT INTO bookmarks__new (
  id,
  video_id,
  caption_id,
  text,
  side,
  offset,
  translation,
  context,
  timestamp,
  etymology,
  notes,
  created_at
)
SELECT
  id,
  video_id,
  caption_id,
  text,
  side,
  offset,
  translation,
  context,
  timestamp,
  etymology,
  notes,
  CAST(strftime('%s', created_at) AS INTEGER)
FROM bookmarks;

DROP TABLE bookmarks;
DROP TABLE videos;
DROP TABLE users;

ALTER TABLE users__new RENAME TO users;
ALTER TABLE videos__new RENAME TO videos;
ALTER TABLE bookmarks__new RENAME TO bookmarks;

CREATE INDEX idx_videos_user ON videos(user_id);
CREATE INDEX idx_bookmarks_video ON bookmarks(video_id);

PRAGMA foreign_keys=ON;
