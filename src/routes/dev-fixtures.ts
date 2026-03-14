import { mergeCaptions } from "../lib/caption-merge.ts";
import { saveSession } from "../lib/caption-session-db.ts";
import { updateVideoIndex } from "../lib/video-index.ts";
import {
  type Json3File,
  type YouTubeExtractionResult,
  pickBestTrack,
} from "../lib/youtube.ts";

const metadataModules = import.meta.glob<YouTubeExtractionResult>(
  "/scripts/youtube-json/*/metadata.json",
  { eager: true, import: "default" },
);

const trackModules = import.meta.glob<{ default: Json3File }>(
  "/scripts/youtube-json/*/track-*.json",
);

export async function bootstrapFixtures() {
  for (const [path, meta] of Object.entries(metadataModules)) {
    const dir = path.replace("/metadata.json", "");
    const tracks = meta.captionTracks;
    const track1 = pickBestTrack(tracks, "ko");
    const track2 = pickBestTrack(tracks, "en");
    if (!track1 || !track2) continue;

    const loader1 = trackModules[`${dir}/track-${track1.vssId}.json`];
    const loader2 = trackModules[`${dir}/track-${track2.vssId}.json`];
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

    updateVideoIndex(
      meta.video.youtubeId,
      meta.video.title,
      meta.video.channelName,
      0,
    );
  }
}
