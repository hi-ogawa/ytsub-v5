import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CaptionPanel } from "../../components/caption-panel.tsx";
import {
  type YTPlayer,
  useYouTubePlayer,
} from "../../components/youtube-player.tsx";
import { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import { useWebSync } from "../use-web-sync.ts";

export function VideoViewerPage({ storage }: { storage: CaptionStorage }) {
  const { youtubeId } = useParams<"youtubeId">();

  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId);

  if (!youtubeId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">No video ID</p>
      </div>
    );
  }

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
        <ViewerCaptionPanel
          key={youtubeId}
          storage={storage}
          youtubeId={youtubeId}
          player={player}
        />
      </div>
    </div>
  );
}

function ViewerCaptionPanel({
  storage,
  youtubeId,
  player,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  player?: YTPlayer;
}) {
  const [runtime] = useState(
    () => new CaptionPanelRuntime({ storage, youtubeId }),
  );
  return (
    <CaptionPanel
      runtime={runtime}
      player={player}
      useSync={({ youtubeId }) => useViewerSync({ storage, youtubeId })}
    />
  );
}

function useViewerSync({
  storage,
  youtubeId,
}: {
  storage: CaptionStorage;
  youtubeId: string;
}) {
  const navigate = useNavigate();
  return useWebSync({
    storage,
    youtubeId,
    onNavigate: () => navigate("/"),
  });
}
