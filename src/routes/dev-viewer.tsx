import { useState } from "react";
import { useParams } from "react-router";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
} from "../components/caption-panel.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import { type YouTubeExtractionResult, parseJson3 } from "../lib/youtube.ts";

const metadataModules = import.meta.glob<YouTubeExtractionResult>(
  "/scripts/youtube-json/*/metadata.json",
  { eager: true, import: "default" },
);

const trackModules = import.meta.glob<{
  default: Parameters<typeof parseJson3>[0];
}>("/scripts/youtube-json/*/track-*.json");

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
      {panelOpen && meta && (
        <ResizablePanel className="fixed top-[65px] right-[10px] bottom-[56px] flex flex-col overflow-hidden rounded-lg border border-border bg-background">
          <CaptionPanel
            tracks={meta.captionTracks}
            fetchCues={async (track, opts) => {
              const key = `/scripts/youtube-json/${videoId}/track-${track.vssId}.json`;
              const loader = trackModules[key];
              if (!loader)
                throw new Error(`No track fixture for ${track.vssId}`);
              const mod = await loader();
              return parseJson3(mod.default, opts);
            }}
            player={player}
            videoMeta={meta.video}
          />
        </ResizablePanel>
      )}
      <CaptionFab open={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
    </div>
  );
}
