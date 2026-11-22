import { useNavigate, useParams } from "react-router";
import { CaptionPanel } from "../../components/caption-panel.tsx";
import { useYouTubePlayer } from "../../components/youtube-player.tsx";
import {
  type CaptionStorage,
  videoIndexStore,
} from "../../lib/caption-storage.ts";
import { useSyncState } from "../../lib/sync.ts";

export function VideoViewerPage({ storage }: { storage: CaptionStorage }) {
  const { youtubeId } = useParams<"youtubeId">();

  const [entries] = videoIndexStore.useValue("entries");
  const entry = entries.find((e) => e.youtubeId === youtubeId);

  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId);

  if (!youtubeId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">No video ID</p>
      </div>
    );
  }

  const videoMeta = {
    youtubeId,
    title: entry?.title ?? "",
    channelName: entry?.channelName ?? "",
    channelId: "",
    duration: 0,
  };

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
        <CaptionPanel
          key={youtubeId}
          storage={storage}
          sessionOnly
          tracks={[]}
          player={player}
          fetchJson3={() => {
            throw new Error("Cannot fetch captions in web viewer");
          }}
          videoMeta={videoMeta}
          useSync={({ youtubeId }) => useViewerSync({ storage, youtubeId })}
        />
      </div>
    </div>
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
  return useSyncState({
    storage,
    youtubeId,
    onNavigate: () => navigate("/"),
  });
}
