import { useState } from "react";
import { useParams } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
} from "../components/caption-panel.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import { useCaptionSession } from "../lib/caption-session.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import type { Json3File, YouTubeExtractionResult } from "../lib/youtube.ts";
import { useZamakApi } from "../lib/zamak-api.ts";

const metadataModules = import.meta.glob<YouTubeExtractionResult>(
  "/scripts/youtube-json/*/metadata.json",
  { eager: true, import: "default" },
);

const trackModules = import.meta.glob<{ default: Json3File }>(
  "/scripts/youtube-json/*/track-*.json",
);

export function DevViewerPage() {
  const { videoId } = useParams<"videoId">();
  const [panelOpen, setPanelOpen] = useState(false);

  const meta = videoId
    ? metadataModules[`/scripts/youtube-json/${videoId}/metadata.json`]
    : undefined;

  const { ref: playerElRef, player } = useYouTubePlayer(meta?.video.youtubeId);

  if (!videoId) return <div className="p-4">No video ID</div>;
  if (!meta)
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        No fixture for {videoId}
      </div>
    );

  return (
    <div className="h-full w-full p-6">
      {/* YouTube embed + fake sidebar (mimics YouTube layout) */}
      <div className="flex gap-6">
        <div className="flex-1">
          <div className="relative rounded pt-[56.2%]">
            <div className="absolute inset-0" ref={playerElRef} />
          </div>
        </div>
        <div className="hidden w-[400px] flex-none rounded lg:block" />
      </div>

      {/* Floating caption panel (same position as extension) */}
      {panelOpen && (
        <ResizablePanel className="fixed top-[65px] right-[10px] bottom-[56px] flex flex-col overflow-hidden rounded-lg border border-border bg-background">
          <DevViewerSession videoId={videoId} meta={meta} player={player} />
        </ResizablePanel>
      )}
      <CaptionFab open={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
    </div>
  );
}

function DevViewerSession({
  videoId,
  meta,
  player,
}: {
  videoId: string;
  meta: YouTubeExtractionResult;
  player: ReturnType<typeof useYouTubePlayer>["player"];
}) {
  const session = useCaptionSession({
    youtubeId: videoId,
    tracks: meta.captionTracks,
    fetchJson3: async (track) => {
      const key = `/scripts/youtube-json/${videoId}/track-${track.vssId}.json`;
      const loader = trackModules[key];
      if (!loader) throw new Error(`No track fixture for ${track.vssId}`);
      const mod = await loader();
      return mod.default;
    },
    videoMeta: meta.video,
  });

  const sel1 = meta.captionTracks.find(
    (t) => t.vssId === session.selectedVssId1,
  );
  const sel2 = meta.captionTracks.find(
    (t) => t.vssId === session.selectedVssId2,
  );

  useZamakApi({
    session,
    rows: session.rows,
    videoMeta: meta.video,
    language1: sel1?.languageCode ?? "ko",
    language2: sel2?.languageCode ?? "en",
  });

  return (
    <CaptionPanel
      tracks={meta.captionTracks}
      player={player}
      session={session}
    />
  );
}

// --- Bookmarks dev page ---

const fixtureBookmarkEntries: VideoIndexEntry[] = Object.values(
  metadataModules,
).map((meta, i) => ({
  youtubeId: meta.video.youtubeId,
  title: meta.video.title,
  channelName: meta.video.channelName ?? "Unknown channel",
  bookmarkCount: [3, 7, 1][i] ?? 2,
  updatedAt: new Date(Date.now() - i * 86400_000).toISOString(),
}));

export function DevBookmarksPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col" style={{ maxHeight: 520 }}>
      <div className="border-b border-neutral-800 px-4 py-3 text-[15px] font-semibold text-neutral-200">
        Bookmarked Videos
      </div>
      <div className="overflow-y-auto bg-neutral-950 text-neutral-200">
        <BookmarksPage
          entries={fixtureBookmarkEntries}
          onVideoClick={(id) => window.open(`/dev/youtube/${id}`, "_blank")}
        />
      </div>
    </div>
  );
}
