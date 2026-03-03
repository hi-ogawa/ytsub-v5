import { index, int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const videos = sqliteTable("videos", {
  id: int().primaryKey({ autoIncrement: true }),
  youtubeId: text("youtube_id").notNull().unique(),
  title: text().notNull(),
  channelName: text("channel_name").notNull().default(""),
  channelId: text("channel_id").notNull().default(""),
  duration: int().notNull().default(0),
  language1: text().notNull().default("ko"),
  language2: text().notNull().default("en"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const captions = sqliteTable(
  "captions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    videoId: int("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    language: text().notNull(),
    idx: int().notNull(),
    begin: real().notNull(),
    end: real().notNull(),
    text: text().notNull(),
  },
  (t) => [
    unique().on(t.videoId, t.language, t.idx),
    index("idx_captions_video").on(t.videoId, t.language),
  ],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: int().primaryKey({ autoIncrement: true }),
    videoId: int("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    captionId: int("caption_id").references(() => captions.id, { onDelete: "set null" }),
    text: text().notNull(),
    side: int().notNull().default(0),
    offset: int().notNull().default(0),
    translation: text().notNull().default(""),
    context: text().notNull().default(""),
    timestamp: real().notNull().default(0),
    notes: text().notNull().default(""),
    status: text().notNull().default("pending"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (t) => [index("idx_bookmarks_video").on(t.videoId), index("idx_bookmarks_status").on(t.status)],
);
