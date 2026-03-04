import { os } from "@orpc/server";
import { bookmarksRouter } from "./routes/bookmarks.ts";
import { videosRouter } from "./routes/videos.ts";

export const router = os.router({
  videos: videosRouter,
  bookmarks: bookmarksRouter,
});

export type Router = typeof router;
