import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export const db = drizzle(env.DB, { schema });

// D1 has a 100 SQL variable limit per query.
// Use sql.raw() for number literals to reduce bind param count.
export const CAPTION_BATCH_SIZE = 10; // 2 bind params per row (text1, text2)
export const BOOKMARK_BATCH_SIZE = 10; // 7 bind params per row (text, translation, context, etymology, notes, status, createdAt)
