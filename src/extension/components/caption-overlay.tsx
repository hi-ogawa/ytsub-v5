import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CaptionPanelFab,
  useFabOpen,
} from "../../components/caption-panel-fab.tsx";
import {
  type BookmarksPageTarget,
  CaptionPanel,
} from "../../components/caption-panel.tsx";
import { ResizablePanel } from "../../components/resizable-panel.tsx";
import { captionPanelPreferences } from "../../lib/caption-panel-preferences.ts";
import { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { UseSync } from "../../lib/sync.ts";
import { fetchPlayerApi, fetchTrackJson3 } from "../../lib/youtube.ts";
import { getVideoPlayer } from "../lib/youtube-page.ts";

export function CaptionOverlay({
  storage,
  youtubeId,
  useSync,
  bookmarksPage,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  useSync: UseSync;
  bookmarksPage: BookmarksPageTarget;
}) {
  const [open, toggleOpen] = useFabOpen(youtubeId);
  const [panelWidth, setPanelWidth] =
    captionPanelPreferences.useValue("panelWidth");

  return (
    <div>
      {open && (
        <ResizablePanel
          width={panelWidth}
          onWidthChange={setPanelWidth}
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
            bookmarksPage={bookmarksPage}
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
  bookmarksPage,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  useSync: UseSync;
  bookmarksPage: BookmarksPageTarget;
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

  return (
    <CaptionPanel
      runtime={runtime}
      player={player}
      useSync={useSync}
      bookmarksPage={bookmarksPage}
    />
  );
}

function getUserLangs(): string[] {
  const { language1, language2 } = captionPanelPreferences.get();
  return [...new Set([...navigator.languages, language1, language2])].filter(
    (language) => language !== undefined,
  );
}
