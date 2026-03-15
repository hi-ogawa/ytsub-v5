import { sql } from "drizzle-orm";
import {
  index,
  int,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: int().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const videos = sqliteTable(
  "videos",
  {
    id: int().primaryKey({ autoIncrement: true }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    youtubeId: text("youtube_id").notNull(),
    title: text().notNull(),
    channelName: text("channel_name").notNull().default(""),
    channelId: text("channel_id").notNull().default(""),
    duration: int().notNull().default(0),
    language1: text().notNull(),
    language2: text().notNull(),
    vssId1: text("vss_id1").notNull(),
    vssId2: text("vss_id2").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique().on(t.userId, t.youtubeId),
    index("idx_videos_user").on(t.userId),
  ],
);

export const captions = sqliteTable(
  "captions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    videoId: int("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: int().notNull(),
    begin: real().notNull(),
    end: real().notNull(),
    text1: text().notNull().default(""),
    text2: text().notNull().default(""),
  },
  (t) => [
    unique().on(t.videoId, t.idx),
    index("idx_captions_video").on(t.videoId),
  ],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: int().primaryKey({ autoIncrement: true }),
    videoId: int("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    captionId: int("caption_id").references(() => captions.id, {
      onDelete: "set null",
    }),
    text: text().notNull(),
    side: int().notNull().default(0),
    offset: int().notNull().default(0),
    translation: text().notNull().default(""),
    context: text().notNull().default(""),
    timestamp: real().notNull().default(0),
    etymology: text().notNull().default(""),
    notes: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_bookmarks_video").on(t.videoId)],
);
