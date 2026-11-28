import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CaptionPanelFab,
  useFabOpen,
} from "../../components/caption-panel-fab.tsx";
import { CaptionPanel } from "../../components/caption-panel.tsx";
import { ResizablePanel } from "../../components/resizable-panel.tsx";
import { captionLanguagePreferences } from "../../lib/caption-language-preferences.ts";
import { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { UseSync } from "../../lib/sync.ts";
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
  const queryClient = useQueryClient();
  const [player] = useState(() => getVideoPlayer());
  const [runtime] = useState(
    () =>
      new CaptionPanelRuntime({
        storage,
        youtubeId,
        trackSource: {
          fetchTracks: () =>
            fetchPlayerApi({ youtubeId, userLangs: getUserLangs() }),
          fetchJson3: (track) =>
            queryClient.query({
              queryKey: ["json3", youtubeId, track.vssId],
              queryFn: () => fetchTrackJson3(track.baseUrl),
              retry: 3,
            }),
        },
      }),
  );

  return <CaptionPanel runtime={runtime} player={player} useSync={useSync} />;
}

function getUserLangs(): string[] {
  const langs = [...navigator.languages];
  const { lang1, lang2 } = captionLanguagePreferences.get();
  for (const lang of [lang1, lang2]) {
    if (lang && !langs.includes(lang)) {
      langs.push(lang);
    }
  }
  return langs;
}
