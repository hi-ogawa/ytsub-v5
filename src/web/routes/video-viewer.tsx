import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { CaptionPanel } from "../../components/caption-panel.tsx";
import {
  type YTPlayer,
  useYouTubePlayer,
} from "../../components/youtube-player.tsx";
import { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { UseSync } from "../../lib/sync.ts";
import { useWebSync } from "../components/use-web-sync.ts";

export function VideoViewerPage({ storage }: { storage: CaptionStorage }) {
  const { youtubeId } = useParams<"youtubeId">();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  if (!youtubeId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">No video ID</p>
      </div>
    );
  }

  return (
    <VideoViewer
      storage={storage}
      youtubeId={youtubeId}
      startTime={getStartTime(searchParams)}
      useSync={({ youtubeId }) => useWebSync({ storage, youtubeId })}
      onOpenBookmarks={() => navigate("/")}
    />
  );
}

export function VideoViewer({
  storage,
  youtubeId,
  startTime,
  useSync,
  onOpenBookmarks,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  startTime?: number;
  useSync: UseSync;
  onOpenBookmarks: () => void;
}) {
  // Where a browser blocks autoplay, as mobile browsers do on a page opened
  // from a link, the player waits paused there until the first tap.
  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId, {
    playFrom: startTime,
  });

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
          startTime={startTime}
          player={player}
          useSync={useSync}
          onOpenBookmarks={onOpenBookmarks}
        />
      </div>
    </div>
  );
}

/** `?t=<seconds>` opens the video at a scene, as Anki cards link to it. */
function getStartTime(searchParams: URLSearchParams): number | undefined {
  const value = searchParams.get("t");
  const time = value ? Number(value) : NaN;
  return Number.isFinite(time) && time >= 0 ? time : undefined;
}

function ViewerCaptionPanel({
  storage,
  youtubeId,
  startTime,
  player,
  useSync,
  onOpenBookmarks,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  startTime?: number;
  player?: YTPlayer;
  useSync: UseSync;
  onOpenBookmarks: () => void;
}) {
  const [runtime] = useState(
    () => new CaptionPanelRuntime({ storage, youtubeId, startTime }),
  );
  return (
    <CaptionPanel
      runtime={runtime}
      player={player}
      useSync={useSync}
      onOpenBookmarks={onOpenBookmarks}
    />
  );
}
