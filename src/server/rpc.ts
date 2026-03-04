import { pub } from "./auth.ts";
import { authRouter } from "./routes/auth.ts";
import { bookmarksRouter } from "./routes/bookmarks.ts";
import { videosRouter } from "./routes/videos.ts";

export const router = pub.router({
  auth: authRouter,
  videos: videosRouter,
  bookmarks: bookmarksRouter,
});

export type Router = typeof router;
