import { and, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { authed } from "../auth.ts";
import { BOOKMARK_BATCH_SIZE, db } from "../db.ts";
import { bookmarks, videos } from "../schema.ts";

/** Verify video belongs to the authenticated user */
async function assertVideoOwner(videoId: number, userId: number) {
  const video = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .get();
  if (!video) throw new Error(`Video ${videoId} not found`);
}

/** Verify bookmark belongs to user (via its video) */
async function assertBookmarkOwner(bookmarkId: number, userId: number) {
  const row = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .innerJoin(videos, eq(bookmarks.videoId, videos.id))
    .where(and(eq(bookmarks.id, bookmarkId), eq(videos.userId, userId)))
    .get();
  if (!row) throw new Error(`Bookmark ${bookmarkId} not found`);
}

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
            etymology: z.string().optional().default(""),
            notes: z.string().optional().default(""),
            status: z.string().optional().default("pending"),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      if (input.bookmarks.length === 0) return { inserted: 0 };
      // Verify all referenced videos belong to user
      const videoIds = [...new Set(input.bookmarks.map((b) => b.videoId))];
      for (const videoId of videoIds) {
        await assertVideoOwner(videoId, context.userId);
      }
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
        etymology: b.etymology,
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
    .handler(async ({ input, context }) => {
      const conditions = [];
      // Always scope to user's videos
      conditions.push(eq(videos.userId, context.userId));
      if (input.videoId !== undefined) {
        conditions.push(eq(bookmarks.videoId, input.videoId));
      }
      if (input.status !== undefined) {
        conditions.push(eq(bookmarks.status, input.status));
      }
      const where = and(...conditions);
      const [total] = await db
        .select({ count: count() })
        .from(bookmarks)
        .innerJoin(videos, eq(bookmarks.videoId, videos.id))
        .where(where);
      const items = await db
        .select({
          id: bookmarks.id,
          videoId: bookmarks.videoId,
          captionId: bookmarks.captionId,
          text: bookmarks.text,
          side: bookmarks.side,
          offset: bookmarks.offset,
          translation: bookmarks.translation,
          context: bookmarks.context,
          timestamp: bookmarks.timestamp,
          etymology: bookmarks.etymology,
          notes: bookmarks.notes,
          status: bookmarks.status,
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .innerJoin(videos, eq(bookmarks.videoId, videos.id))
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
        etymology: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertBookmarkOwner(input.id, context.userId);
      const { id, ...updates } = input;
      const setValues: Record<string, string> = {};
      if (updates.status !== undefined) setValues.status = updates.status;
      if (updates.translation !== undefined)
        setValues.translation = updates.translation;
      if (updates.etymology !== undefined)
        setValues.etymology = updates.etymology;
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
    .handler(async ({ input, context }) => {
      await assertBookmarkOwner(input.id, context.userId);
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
