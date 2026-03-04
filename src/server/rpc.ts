import { count } from "drizzle-orm";
import { pub } from "./auth.ts";
import { db } from "./db.ts";
import { authRouter } from "./routes/auth.ts";
import { bookmarksRouter } from "./routes/bookmarks.ts";
import { videosRouter } from "./routes/videos.ts";
import { videos } from "./schema.ts";

export const router = pub.router({
  health: pub.handler(async () => {
    const [row] = await db.select({ count: count() }).from(videos);
    return { ok: true, videos: row.count };
  }),
  auth: authRouter,
  videos: videosRouter,
  bookmarks: bookmarksRouter,
});

export type Router = typeof router;
