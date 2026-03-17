import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
  useFabOpen,
} from "../components/caption-panel.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import { fixtureMetadata, fixtureTracks } from "../lib/dev-fixtures.ts";
import { useSyncState } from "../lib/sync.ts";
import type {
  YouTubeCaptionTrack,
  YouTubeExtractionResult,
} from "../lib/youtube.ts";

export function DevViewerPage() {
  const { videoId } = useParams<"videoId">();
  const [panelOpen, togglePanel] = useFabOpen(videoId ?? "");

  const meta = videoId
    ? fixtureMetadata[`/scripts/youtube-json/${videoId}/metadata.json`]
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
      <CaptionFab open={panelOpen} onClick={togglePanel} />
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
  const navigate = useNavigate();
  const fetchJson3 = useCallback(
    async (track: YouTubeCaptionTrack) => {
      const key = `/scripts/youtube-json/${videoId}/track-${track.vssId}.json`;
      const loader = fixtureTracks[key];
      if (!loader) throw new Error(`No track fixture for ${track.vssId}`);
      const mod = await loader();
      return mod.default;
    },
    [videoId],
  );

  const [hasSession, setHasSession] = useState(false);
  const syncState = useSyncState({ youtubeId: videoId, hasSession });
  const sync = { state: syncState.state, onNavigate: () => navigate("/dev") };

  return (
    <CaptionPanel
      tracks={meta.captionTracks}
      player={player}
      fetchJson3={fetchJson3}
      videoMeta={meta.video}
      sync={sync}
      onSessionReady={setHasSession}
    />
  );
}
