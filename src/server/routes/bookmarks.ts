import { and, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { authed } from "../auth.ts";
import { db } from "../db.ts";
import { bookmarks } from "../schema.ts";

// D1 has a 100 SQL variable limit per query
// Use sql.raw() for number literals to reduce bind param count
const BOOKMARK_BATCH_SIZE = 16; // 6 bind params per row

export const bookmarksRouter = authed.router({
  createBookmarks: authed
    .input(
      z.object({
        bookmarks: z.array(
          z.object({
            videoId: z.number().int(),
            captionId: z.number().int().optional(),
            text: z.string(),
            side: z.number().int().optional().default(0),
            offset: z.number().int().optional().default(0),
            translation: z.string().optional().default(""),
            context: z.string().optional().default(""),
            timestamp: z.number().optional().default(0),
            notes: z.string().optional().default(""),
            status: z.string().optional().default("pending"),
          }),
        ),
      }),
    )
    .handler(async ({ input }) => {
      if (input.bookmarks.length === 0) return { inserted: 0 };
      const rows = input.bookmarks.map((b) => ({
        videoId: sql.raw(`${b.videoId}`),
        captionId:
          b.captionId !== undefined ? sql.raw(`${b.captionId}`) : undefined,
        text: b.text,
        side: sql.raw(`${b.side}`),
        offset: sql.raw(`${b.offset}`),
        translation: b.translation,
        context: b.context,
        timestamp: sql.raw(`${b.timestamp}`),
        notes: b.notes,
        status: b.status,
      }));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BOOKMARK_BATCH_SIZE) {
        const batch = rows.slice(i, i + BOOKMARK_BATCH_SIZE);
        const result = await db.insert(bookmarks).values(batch).returning();
        inserted += result.length;
      }
      return { inserted };
    }),

  listBookmarks: authed
    .input(
      z.object({
        videoId: z.number().int().optional(),
        status: z.string().optional(),
        limit: z.number().int().optional().default(20),
        offset: z.number().int().optional().default(0),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.videoId !== undefined) {
        conditions.push(eq(bookmarks.videoId, input.videoId));
      }
      if (input.status !== undefined) {
        conditions.push(eq(bookmarks.status, input.status));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [total] = await db
        .select({ count: count() })
        .from(bookmarks)
        .where(where);
      const items = await db
        .select()
        .from(bookmarks)
        .where(where)
        .orderBy(desc(bookmarks.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { items, total: total.count };
    }),

  updateBookmark: authed
    .input(
      z.object({
        id: z.number().int(),
        status: z.string().optional(),
        translation: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...updates } = input;
      const setValues: Record<string, string> = {};
      if (updates.status !== undefined) setValues.status = updates.status;
      if (updates.translation !== undefined)
        setValues.translation = updates.translation;
      if (updates.notes !== undefined) setValues.notes = updates.notes;
      if (Object.keys(setValues).length === 0) {
        throw new Error("No fields to update");
      }
      const [row] = await db
        .update(bookmarks)
        .set(setValues)
        .where(eq(bookmarks.id, id))
        .returning();
      if (!row) {
        throw new Error(`Bookmark ${id} not found`);
      }
      return row;
    }),

  deleteBookmark: authed
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const [row] = await db
        .delete(bookmarks)
        .where(eq(bookmarks.id, input.id))
        .returning();
      if (!row) {
        throw new Error(`Bookmark ${input.id} not found`);
      }
      return row;
    }),
});
