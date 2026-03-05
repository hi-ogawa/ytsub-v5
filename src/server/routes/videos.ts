import { count, desc, eq } from "drizzle-orm";
import z from "zod";
import { authed } from "../auth.ts";
import { db } from "../db.ts";
import { bookmarks, captions, videos } from "../schema.ts";

// D1 has a 100 SQL variable limit per query
const CAPTION_BATCH_SIZE = 16; // 6 bind params per row
const BOOKMARK_BATCH_SIZE = 9; // 11 bind params per row

export const videosRouter = authed.router({
  createVideo: authed
    .input(
      z.object({
        youtubeId: z.string(),
        title: z.string(),
        channelName: z.string().optional().default(""),
        channelId: z.string().optional().default(""),
        duration: z.number().int().optional().default(0),
        language1: z.string().optional().default("ko"),
        language2: z.string().optional().default("en"),
      }),
    )
    .handler(async ({ input }) => {
      const [row] = await db
        .insert(videos)
        .values(input)
        .onConflictDoUpdate({
          target: videos.youtubeId,
          set: {
            title: input.title,
            channelName: input.channelName,
            channelId: input.channelId,
            duration: input.duration,
            language1: input.language1,
            language2: input.language2,
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
    .handler(async ({ input }) => {
      const video = await db
        .select({ id: videos.id })
        .from(videos)
        .where(eq(videos.id, input.videoId))
        .get();
      if (!video) {
        throw new Error(`Video ${input.videoId} not found`);
      }
      const rows = input.captions.map((c) => ({
        ...c,
        videoId: input.videoId,
      }));
      if (rows.length === 0) return { inserted: 0 };
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
    .handler(async ({ input }) => {
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
    .handler(async ({ input }) => {
      const [total] = await db.select({ count: count() }).from(videos);
      const items = await db
        .select()
        .from(videos)
        .orderBy(desc(videos.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { items, total: total.count };
    }),

  getVideo: authed
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const video = await db
        .select()
        .from(videos)
        .where(eq(videos.id, input.id))
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
          language1: z.string().optional().default("ko"),
          language2: z.string().optional().default("en"),
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
              notes: z.string().optional().default(""),
              status: z.string().optional().default("pending"),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .handler(async ({ input }) => {
      // Upsert video
      const [video] = await db
        .insert(videos)
        .values(input.video)
        .onConflictDoUpdate({
          target: videos.youtubeId,
          set: {
            title: input.video.title,
            channelName: input.video.channelName,
            channelId: input.video.channelId,
            duration: input.video.duration,
            language1: input.video.language1,
            language2: input.video.language2,
          },
        })
        .returning();

      // Delete existing captions (cascade deletes bookmark caption refs)
      await db.delete(captions).where(eq(captions.videoId, video.id));

      // Insert captions in batches to avoid D1 SQL variable limit
      let insertedCaptions = 0;
      if (input.captions.length > 0) {
        const rows = input.captions.map((c) => ({ ...c, videoId: video.id }));
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
            videoId: video.id,
            captionId: captionMap.get(b.captionIdx) ?? null,
            text: b.text,
            side: b.side,
            offset: b.offset,
            translation: b.translation,
            context: b.context,
            timestamp: input.captions[b.captionIdx]?.begin ?? 0,
            notes: b.notes,
            status: b.status,
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

  deleteVideo: authed
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const [row] = await db
        .delete(videos)
        .where(eq(videos.id, input.id))
        .returning();
      if (!row) {
        throw new Error(`Video ${input.id} not found`);
      }
      return row;
    }),
});
