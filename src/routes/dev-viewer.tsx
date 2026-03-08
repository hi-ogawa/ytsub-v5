import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
} from "../components/caption-panel.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import {
  type CaptionCue,
  type YouTubeCaptionTrack,
  type YouTubeExtractionResult,
  parseJson3,
} from "../lib/youtube.ts";

async function fetchMetadata(
  videoId: string,
): Promise<YouTubeExtractionResult> {
  const res = await fetch(`/scripts/youtube-json/${videoId}/metadata.json`);
  if (!res.ok) throw new Error(`No fixture for ${videoId}`);
  return res.json();
}

async function fetchTrackFixture(
  videoId: string,
  track: YouTubeCaptionTrack,
): Promise<CaptionCue[]> {
  const res = await fetch(
    `/scripts/youtube-json/${videoId}/track-${track.vssId}.json`,
  );
  if (!res.ok) throw new Error(`No track fixture for ${track.vssId}`);
  return parseJson3(await res.json());
}

export function DevViewerPage() {
  const { videoId } = useParams<"videoId">();
  const [panelOpen, setPanelOpen] = useState(false);

  const {
    data: meta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dev-metadata", videoId],
    queryFn: () => fetchMetadata(videoId!),
    enabled: !!videoId,
  });

  const { ref: playerElRef, player } = useYouTubePlayer(meta?.video.youtubeId);

  if (!videoId) return <div className="p-4">No video ID</div>;
  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {String(error)}
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
            fetchCues={(track) => fetchTrackFixture(videoId, track)}
            player={player}
          />
        </ResizablePanel>
      )}
      <CaptionFab open={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
    </div>
  );
}
