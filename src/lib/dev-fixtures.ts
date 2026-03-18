import { mergeCaptions } from "./caption-merge.ts";
import { saveSession } from "./caption-session-db.ts";
import { addToVideoIndex } from "./video-index.ts";
import {
  type Json3File,
  type YouTubeExtractionResult,
  pickBestTrack,
} from "./youtube.ts";

export const fixtureMetadata = import.meta.glob<YouTubeExtractionResult>(
  "/scripts/youtube-json/*/metadata.json",
  { eager: true, import: "default" },
);

export const fixtureTracks = import.meta.glob<{ default: Json3File }>(
  "/scripts/youtube-json/*/track-*.json",
);

export async function bootstrapFixtures() {
  for (const [path, meta] of Object.entries(fixtureMetadata)) {
    const dir = path.replace("/metadata.json", "");
    const tracks = meta.captionTracks;
    const track1 = pickBestTrack(tracks, "ko");
    const track2 = pickBestTrack(tracks, "en");
    if (!track1 || !track2) continue;

    const loader1 = fixtureTracks[`${dir}/track-${track1.vssId}.json`];
    const loader2 = fixtureTracks[`${dir}/track-${track2.vssId}.json`];
    if (!loader1 || !loader2) continue;

    const [mod1, mod2] = await Promise.all([loader1(), loader2()]);
    const { strategy, captions } = mergeCaptions(
      { json3: mod1.default, vssId: track1.vssId },
      { json3: mod2.default, vssId: track2.vssId },
    );

    await saveSession({
      youtubeId: meta.video.youtubeId,
      title: meta.video.title,
      channelName: meta.video.channelName,
      channelId: meta.video.channelId,
      duration: meta.video.duration,
      vssId1: track1.vssId,
      vssId2: track2.vssId,
      language1: track1.languageCode,
      language2: track2.languageCode,
      strategy,
      captions,
      bookmarks: [],
    });

    addToVideoIndex(
      meta.video.youtubeId,
      meta.video.title,
      meta.video.channelName,
      0,
    );
  }
}
