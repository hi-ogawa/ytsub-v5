import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { CaptionPanel } from "../components/caption-panel.tsx";
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
    <div className="flex h-full w-full flex-col lg:flex-row lg:gap-2 lg:p-2">
      {/* YouTube embed */}
      <div className="flex-none lg:flex-1">
        <div className="flex justify-center">
          <div className="relative w-full max-w-xl lg:max-w-none">
            <div className="relative pt-[56.2%]">
              <div className="absolute top-0 h-full w-full" ref={playerElRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Caption panel */}
      <div className="flex min-h-0 flex-[1_0_0] flex-col border-t lg:w-1/3 lg:flex-none lg:rounded lg:border">
        {meta && (
          <CaptionPanel
            tracks={meta.captionTracks}
            fetchCues={(track) => fetchTrackFixture(videoId, track)}
            player={player}
          />
        )}
      </div>
    </div>
  );
}
