import { os } from "@orpc/server";
import { count, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "../db.ts";
import { captions, videos } from "../schema.ts";

export const videosRouter = os.router({
  createVideo: os
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

  createCaptions: os
    .input(
      z.object({
        videoId: z.number().int(),
        captions: z.array(
          z.object({
            language: z.string(),
            idx: z.number().int(),
            begin: z.number(),
            end: z.number(),
            text: z.string(),
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
      const result = await db.insert(captions).values(rows).returning();
      return { inserted: result.length };
    }),

  listVideos: os
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

  getVideo: os
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
      const captionCounts = await db
        .select({
          language: captions.language,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(captions)
        .where(eq(captions.videoId, input.id))
        .groupBy(captions.language);
      return { ...video, captionCounts };
    }),

  deleteVideo: os
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
