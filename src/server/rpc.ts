import { os } from "@orpc/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "./db.ts";
import { bookmarks, captions, videos } from "./schema.ts";

const BATCH_CHUNK_SIZE = 100;

type ImportVideoInput = {
  youtube_id: string;
  title: string;
  channel_name?: string;
  channel_id?: string;
  duration?: number;
  language1?: string;
  language2?: string;
  captions?: Array<{
    language: string;
    idx: number;
    begin: number;
    end: number;
    text: string;
  }>;
};

type BulkCreateBookmarksInput = {
  video_id: number;
  bookmarks: Array<{
    caption_id?: number | null;
    text: string;
    side?: number;
    offset?: number;
    translation?: string;
    context?: string;
    timestamp?: number;
    notes?: string;
    status?: string;
  }>;
};

export const router = os.router({
  health: os.handler(async () => {
    const [row] = await db.select({ count: count() }).from(videos);
    return { ok: true, videos: row.count };
  }),

  videos: os.router({
    import: os.handler(async ({ input }) => {
      const inp = input as ImportVideoInput;
      await db
        .insert(videos)
        .values({
          youtubeId: inp.youtube_id,
          title: inp.title,
          channelName: inp.channel_name ?? "",
          channelId: inp.channel_id ?? "",
          duration: inp.duration ?? 0,
          language1: inp.language1 ?? "ko",
          language2: inp.language2 ?? "en",
        })
        .onConflictDoUpdate({
          target: videos.youtubeId,
          set: {
            title: inp.title,
            channelName: inp.channel_name ?? "",
            channelId: inp.channel_id ?? "",
            duration: inp.duration ?? 0,
            language1: inp.language1 ?? "ko",
            language2: inp.language2 ?? "en",
          },
        });

      const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.youtubeId, inp.youtube_id));

      if (inp.captions && inp.captions.length > 0) {
        for (let i = 0; i < inp.captions.length; i += BATCH_CHUNK_SIZE) {
          const chunk = inp.captions
            .slice(i, i + BATCH_CHUNK_SIZE)
            .map((c) => ({
              videoId: video.id,
              language: c.language,
              idx: c.idx,
              begin: c.begin,
              end: c.end,
              text: c.text,
            }));
          await db.insert(captions).values(chunk).onConflictDoNothing();
        }
      }

      return { id: video.id };
    }),

    list: os.handler(async () => {
      return db.select().from(videos).orderBy(desc(videos.id));
    }),

    get: os.handler(async ({ input }) => {
      const { id } = input as { id: number };
      const [video] = await db.select().from(videos).where(eq(videos.id, id));
      if (!video) throw new Error("Not found");

      const caps = await db
        .select()
        .from(captions)
        .where(eq(captions.videoId, id))
        .orderBy(asc(captions.language), asc(captions.idx));

      return { ...video, captions: caps };
    }),
  }),

  bookmarks: os.router({
    bulkCreate: os.handler(async ({ input }) => {
      const { video_id, bookmarks: items } = input as BulkCreateBookmarksInput;
      if (items.length === 0) return { count: 0 };

      for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
        const chunk = items.slice(i, i + BATCH_CHUNK_SIZE).map((b) => ({
          videoId: video_id,
          captionId: b.caption_id ?? null,
          text: b.text,
          side: b.side ?? 0,
          offset: b.offset ?? 0,
          translation: b.translation ?? "",
          context: b.context ?? "",
          timestamp: b.timestamp ?? 0,
          notes: b.notes ?? "",
          status: b.status ?? "pending",
        }));
        await db.insert(bookmarks).values(chunk);
      }

      return { count: items.length };
    }),

    list: os.handler(async ({ input }) => {
      const { videoId } = input as { videoId: number };
      return db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.videoId, videoId))
        .orderBy(asc(bookmarks.timestamp));
    }),
  }),
});

export type Router = typeof router;
