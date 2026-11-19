import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export const db = drizzle(env.DB, { schema });

/** Mark the video as changed on the server, so the app offers a pull */
export async function touchVideo(videoId: number) {
  await db
    .update(schema.videos)
    .set({ updatedAt: sql`datetime('now')` })
    .where(eq(schema.videos.id, videoId));
}

// D1 has a 100 SQL variable limit per query.
// Use sql.raw() for number literals to reduce bind param count.
export const CAPTION_BATCH_SIZE = 10; // 2 bind params per row (text1, text2)
export const BOOKMARK_BATCH_SIZE = 10; // 6 bind params per row (text, translation, context, etymology, notes, createdAt)
