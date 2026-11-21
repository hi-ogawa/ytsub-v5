import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
  useFabOpen,
} from "../components/caption-panel.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import type { YouTubeExtractionResult } from "../lib/youtube.ts";
import { fetchPlayerApi, fetchTrackJson3 } from "../lib/youtube.ts";
import { useExtensionSync } from "./lib/extension-sync.ts";
import { getVideoPlayer } from "./lib/youtube-page.ts";

export function CaptionOverlay({ videoId }: { videoId: string }) {
  const [open, toggleOpen] = useFabOpen(videoId);

  return (
    <div>
      {open && (
        <ResizablePanel
          id="zamak-root"
          style={{
            position: "fixed",
            right: "10px",
            top: "65px",
            bottom: "56px",
            pointerEvents: "auto",
          }}
        >
          <ExtensionViewer videoId={videoId} />
        </ResizablePanel>
      )}
      <CaptionFab open={open} onClick={toggleOpen} />
    </div>
  );
}

function ExtensionViewer({ videoId }: { videoId: string }) {
  const [player] = useState(() => getVideoPlayer());

  const metadataQuery = useQuery({
    queryKey: ["extension-metadata", videoId],
    queryFn: () => fetchPlayerApi({ videoId, userLangs: getUserLangs() }),
  });
  const { data, isLoading, error } = metadataQuery;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading subtitles…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {String(error)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {data && <ExtensionSession data={data} player={player} />}
    </div>
  );
}

function getUserLangs(): string[] {
  const langs = [...navigator.languages];
  try {
    const pref = localStorage.getItem("zamak:preferred-langs");
    if (pref) {
      const { lang1, lang2 } = JSON.parse(pref);
      if (lang1 && !langs.includes(lang1)) {
        langs.push(lang1);
      }
      if (lang2 && !langs.includes(lang2)) {
        langs.push(lang2);
      }
    }
  } catch {}
  return langs;
}

function ExtensionSession({
  data,
  player,
}: {
  data: YouTubeExtractionResult;
  player?: YTPlayer;
}) {
  return (
    <CaptionPanel
      tracks={data.captionTracks}
      player={player}
      fetchJson3={(track) => fetchTrackJson3(track.baseUrl)}
      videoMeta={data.video}
      useSync={useExtensionSync}
    />
  );
}
