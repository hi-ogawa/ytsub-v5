import { os } from "@orpc/server";
import { count } from "drizzle-orm";
import { db } from "./db.ts";
import { bookmarksRouter } from "./routes/bookmarks.ts";
import { videosRouter } from "./routes/videos.ts";
import { videos } from "./schema.ts";

export const router = os.router({
  health: os.handler(async () => {
    const [row] = await db.select({ count: count() }).from(videos);
    return { ok: true, videos: row.count };
  }),
  videos: videosRouter,
  bookmarks: bookmarksRouter,
});

export type Router = typeof router;
