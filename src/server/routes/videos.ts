import { and, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { authed } from "../auth.ts";
import { BOOKMARK_BATCH_SIZE, CAPTION_BATCH_SIZE, db } from "../db.ts";
import { bookmarks, captions, videos } from "../schema.ts";

export const videosRouter = authed.router({
  createVideo: authed
    .input(
      z.object({
        youtubeId: z.string(),
        title: z.string(),
        channelName: z.string().optional().default(""),
        channelId: z.string().optional().default(""),
        duration: z.number().int().optional().default(0),
        language1: z.string(),
        language2: z.string(),
        vssId1: z.string(),
        vssId2: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(videos)
        .values({ ...input, userId: context.userId })
        .onConflictDoUpdate({
          target: [videos.userId, videos.youtubeId],
          set: {
            title: input.title,
            channelName: input.channelName,
            channelId: input.channelId,
            duration: input.duration,
            language1: input.language1,
            language2: input.language2,
            vssId1: input.vssId1,
            vssId2: input.vssId2,
            updatedAt: sql`datetime('now')`,
          },
        })
        .returning();
      return row;
    }),

  createCaptions: authed
    .input(
      z.object({
        videoId: z.number().int(),
        captions: z.array(
          z.object({
            idx: z.number().int(),
            begin: z.number(),
            end: z.number(),
            text1: z.string().optional().default(""),
            text2: z.string().optional().default(""),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const video = await db
        .select({ id: videos.id })
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.userId, context.userId)),
        )
        .get();
      if (!video) {
        throw new Error(`Video ${input.videoId} not found`);
      }
      if (input.captions.length === 0) return { inserted: 0 };
      const rows = input.captions.map((c) => ({
        videoId: sql.raw(`${input.videoId}`),
        idx: sql.raw(`${c.idx}`),
        begin: sql.raw(`${c.begin}`),
        end: sql.raw(`${c.end}`),
        text1: c.text1,
        text2: c.text2,
      }));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CAPTION_BATCH_SIZE) {
        const batch = rows.slice(i, i + CAPTION_BATCH_SIZE);
        const result = await db.insert(captions).values(batch).returning();
        inserted += result.length;
      }
      return { inserted };
    }),

  listCaptions: authed
    .input(z.object({ videoId: z.number().int() }))
    .handler(async ({ input, context }) => {
      // Verify video belongs to user
      const video = await db
        .select({ id: videos.id })
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.userId, context.userId)),
        )
        .get();
      if (!video) throw new Error(`Video ${input.videoId} not found`);
      return db
        .select()
        .from(captions)
        .where(eq(captions.videoId, input.videoId))
        .orderBy(captions.idx);
    }),

  listVideos: authed
    .input(
      z.object({
        limit: z.number().int().optional().default(20),
        offset: z.number().int().optional().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const where = eq(videos.userId, context.userId);
      const [total] = await db
        .select({ count: count() })
        .from(videos)
        .where(where);
      const items = await db
        .select()
        .from(videos)
        .where(where)
        .orderBy(desc(videos.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { items, total: total.count };
    }),

  getVideo: authed
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const video = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, context.userId)))
        .get();
      if (!video) {
        throw new Error(`Video ${input.id} not found`);
      }
      const [{ captionCount }] = await db
        .select({ captionCount: count() })
        .from(captions)
        .where(eq(captions.videoId, input.id));
      return { ...video, captionCount };
    }),

  importVideo: authed
    .input(
      z.object({
        video: z.object({
          youtubeId: z.string(),
          title: z.string(),
          channelName: z.string().optional().default(""),
          channelId: z.string().optional().default(""),
          duration: z.number().int().optional().default(0),
          language1: z.string(),
          language2: z.string(),
          vssId1: z.string(),
          vssId2: z.string(),
        }),
        captions: z.array(
          z.object({
            idx: z.number().int(),
            begin: z.number(),
            end: z.number(),
            text1: z.string().optional().default(""),
            text2: z.string().optional().default(""),
          }),
        ),
        bookmarks: z
          .array(
            z.object({
              text: z.string(),
              translation: z.string().optional().default(""),
              captionIdx: z.number().int(),
              side: z.number().int().optional().default(0),
              offset: z.number().int().optional().default(0),
              context: z.string().optional().default(""),
              etymology: z.string().optional().default(""),
              notes: z.string().optional().default(""),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .handler(async ({ input, context }) => {
      // Upsert video
      const [video] = await db
        .insert(videos)
        .values({ ...input.video, userId: context.userId })
        .onConflictDoUpdate({
          target: [videos.userId, videos.youtubeId],
          set: {
            title: input.video.title,
            channelName: input.video.channelName,
            channelId: input.video.channelId,
            duration: input.video.duration,
            language1: input.video.language1,
            language2: input.video.language2,
            vssId1: input.video.vssId1,
            vssId2: input.video.vssId2,
            updatedAt: sql`datetime('now')`,
          },
        })
        .returning();

      // Delete existing captions (cascade deletes bookmark caption refs)
      await db.delete(captions).where(eq(captions.videoId, video.id));

      // Insert captions in batches to avoid D1 SQL variable limit
      let insertedCaptions = 0;
      if (input.captions.length > 0) {
        const rows = input.captions.map((c) => ({
          videoId: sql.raw(`${video.id}`),
          idx: sql.raw(`${c.idx}`),
          begin: sql.raw(`${c.begin}`),
          end: sql.raw(`${c.end}`),
          text1: c.text1,
          text2: c.text2,
        }));
        let allInserted: { idx: number; id: number }[] = [];
        for (let i = 0; i < rows.length; i += CAPTION_BATCH_SIZE) {
          const batch = rows.slice(i, i + CAPTION_BATCH_SIZE);
          const result = await db.insert(captions).values(batch).returning();
          allInserted = allInserted.concat(result);
        }
        insertedCaptions = allInserted.length;

        // Insert bookmarks (resolve captionIdx → captionId)
        if (input.bookmarks.length > 0) {
          // Build idx → captionId map
          const captionMap = new Map(allInserted.map((c) => [c.idx, c.id]));
          const bookmarkRows = input.bookmarks.map((b) => ({
            videoId: sql.raw(`${video.id}`),
            captionId: sql.raw(`${captionMap.get(b.captionIdx) ?? "null"}`),
            text: b.text,
            side: sql.raw(`${b.side}`),
            offset: sql.raw(`${b.offset}`),
            translation: b.translation,
            context: b.context,
            timestamp: sql.raw(`${input.captions[b.captionIdx]?.begin ?? 0}`),
            etymology: b.etymology,
            notes: b.notes,
          }));
          // Delete existing bookmarks for this video first
          await db.delete(bookmarks).where(eq(bookmarks.videoId, video.id));
          for (let i = 0; i < bookmarkRows.length; i += BOOKMARK_BATCH_SIZE) {
            const batch = bookmarkRows.slice(i, i + BOOKMARK_BATCH_SIZE);
            await db.insert(bookmarks).values(batch);
          }
        }
      }

      return {
        videoId: video.id,
        captions: insertedCaptions,
        bookmarks: input.bookmarks.length,
      };
    }),

  getFullSession: authed
    .input(z.object({ youtubeId: z.string() }))
    .handler(async ({ input, context }) => {
      const video = await db
        .select()
        .from(videos)
        .where(
          and(
            eq(videos.youtubeId, input.youtubeId),
            eq(videos.userId, context.userId),
          ),
        )
        .get();
      if (!video) return null;
      const videoCaptions = await db
        .select()
        .from(captions)
        .where(eq(captions.videoId, video.id))
        .orderBy(captions.idx);
      const videoBookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.videoId, video.id));
      return { video, captions: videoCaptions, bookmarks: videoBookmarks };
    }),

  getVideoUpdatedAt: authed
    .input(z.object({ youtubeId: z.string() }))
    .handler(async ({ input, context }) => {
      const video = await db
        .select({ updatedAt: videos.updatedAt })
        .from(videos)
        .where(
          and(
            eq(videos.youtubeId, input.youtubeId),
            eq(videos.userId, context.userId),
          ),
        )
        .get();
      return video ? { updatedAt: video.updatedAt } : null;
    }),

  deleteVideo: authed
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const [row] = await db
        .delete(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, context.userId)))
        .returning();
      if (!row) {
        throw new Error(`Video ${input.id} not found`);
      }
      return row;
    }),
});
