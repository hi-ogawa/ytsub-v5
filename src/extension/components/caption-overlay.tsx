import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CaptionPanelFab,
  useFabOpen,
} from "../../components/caption-panel-fab.tsx";
import { CaptionPanel } from "../../components/caption-panel.tsx";
import { ResizablePanel } from "../../components/resizable-panel.tsx";
import type { YTPlayer } from "../../components/youtube-player.tsx";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { UseSync } from "../../lib/sync.ts";
import type { YouTubeExtractionResult } from "../../lib/youtube.ts";
import { fetchPlayerApi, fetchTrackJson3 } from "../../lib/youtube.ts";
import { getVideoPlayer } from "../lib/youtube-page.ts";

export function CaptionOverlay({
  storage,
  youtubeId,
  useSync,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  useSync: UseSync;
}) {
  const [open, toggleOpen] = useFabOpen(youtubeId);

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
          <ExtensionViewer
            storage={storage}
            youtubeId={youtubeId}
            useSync={useSync}
          />
        </ResizablePanel>
      )}
      <CaptionPanelFab open={open} onClick={toggleOpen} />
    </div>
  );
}

function ExtensionViewer({
  storage,
  youtubeId,
  useSync,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  useSync: UseSync;
}) {
  const [player] = useState(() => getVideoPlayer());

  const metadataQuery = useQuery({
    queryKey: ["extension-metadata", youtubeId],
    queryFn: () => fetchPlayerApi({ youtubeId, userLangs: getUserLangs() }),
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
      {data && (
        <ExtensionSession
          storage={storage}
          data={data}
          player={player}
          useSync={useSync}
        />
      )}
    </div>
  );
}

function ExtensionSession({
  storage,
  data,
  player,
  useSync,
}: {
  storage: CaptionStorage;
  data: YouTubeExtractionResult;
  player?: YTPlayer;
  useSync: UseSync;
}) {
  return (
    <CaptionPanel
      storage={storage}
      tracks={data.captionTracks}
      player={player}
      fetchJson3={(track) => fetchTrackJson3(track.baseUrl)}
      videoMeta={data.video}
      useSync={useSync}
    />
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
