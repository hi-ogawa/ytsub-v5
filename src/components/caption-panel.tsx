import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { captionPanelPreferences } from "../lib/caption-panel-preferences.ts";
import {
  type CaptionSession,
  CaptionPanelRuntime,
} from "../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../lib/caption-storage.ts";
import type { UseSync } from "../lib/sync.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  type YouTubeVideoData,
  langFromVssId,
} from "../lib/youtube.ts";
import { CaptionPanelContent } from "./caption-panel-content.tsx";
import {
  SettingsDropdown,
  SettingsDropdownSkeleton,
} from "./settings-menu.tsx";
import { TrackPicker } from "./track-picker.tsx";
import { useStoreSelector } from "./use-store-value.ts";
import type { YTPlayer } from "./youtube-player.tsx";

type CaptionPanelProps = {
  storage: CaptionStorage;
  tracks: YouTubeCaptionTrack[];
  player?: YTPlayer;
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  videoMeta: YouTubeVideoData;
  // Called by the sync menu each time it opens, so its queries refetch then.
  useSync: UseSync;
  sessionOnly?: boolean;
};

export function CaptionPanel({
  storage,
  tracks,
  player,
  fetchJson3,
  videoMeta,
  useSync,
  sessionOnly,
}: CaptionPanelProps) {
  const queryClient = useQueryClient();
  const [runtime] = useState(
    () =>
      new CaptionPanelRuntime({
        storage,
        videoMeta,
        tracks,
        fetchJson3: (track) =>
          queryClient.fetchQuery({
            queryKey: ["json3", videoMeta.youtubeId, track.vssId],
            queryFn: () => fetchJson3(track),
            retry: 3,
          }),
      }),
  );

  useEffect(() => {
    void runtime.restore();
  }, [runtime]);

  useEffect(() => player && runtime.attachPlayer(player), [runtime, player]);

  const restoring = useStoreSelector(runtime.store, (s) => s.restoring);
  const session = useStoreSelector(runtime.store, (s) => s.session);

  // TODO: better indicator?
  if (restoring) {
    return null;
  }

  if (!session) {
    if (sessionOnly) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No session available
        </div>
      );
    }
    return <CaptionPanelLoading runtime={runtime} />;
  }

  return (
    <CaptionPanelWithSession
      runtime={runtime}
      session={session}
      sessionOnly={!!sessionOnly}
      useSync={useSync}
    />
  );
}

function CaptionPanelLoading({ runtime }: { runtime: CaptionPanelRuntime }) {
  const vssId1 = useStoreSelector(runtime.store, (s) => s.selectedVssId1);
  const vssId2 = useStoreSelector(runtime.store, (s) => s.selectedVssId2);
  const building = useStoreSelector(runtime.store, (s) => s.building);
  const buildError = useStoreSelector(runtime.store, (s) => s.buildError);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={runtime.tracks}
            selectedVssId1={vssId1}
            selectedVssId2={vssId2}
            onSelect={(v1, v2) =>
              runtime.selectTracks({ vssId1: v1, vssId2: v2 })
            }
          />
        </div>
        <SettingsDropdownSkeleton />
      </div>

      {buildError ? (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          {String(buildError)}
        </div>
      ) : building ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading subtitles…
        </div>
      ) : null}
    </div>
  );
}

function CaptionPanelWithSession({
  runtime,
  session,
  sessionOnly,
  useSync,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
  sessionOnly: boolean;
  useSync: UseSync;
}) {
  const [autoScroll, setAutoScroll] =
    captionPanelPreferences.useValue("autoScroll");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b gap-1">
        {!sessionOnly ? (
          <div className="min-w-0 flex-1">
            <TrackPicker
              tracks={runtime.tracks}
              selectedVssId1={session.vssId1}
              selectedVssId2={session.vssId2}
              onSelect={(v1, v2) =>
                runtime.selectTracks({ vssId1: v1, vssId2: v2 })
              }
              disabled={session.bookmarks.length > 0}
            />
          </div>
        ) : (
          <span className="flex-1 px-2 py-1 text-sm text-muted-foreground lg:py-1.5">
            {langName(session.vssId1)} · {langName(session.vssId2)}
          </span>
        )}
        <SettingsDropdown
          runtime={runtime}
          session={session}
          autoScroll={autoScroll}
          onSetAutoScroll={setAutoScroll}
          useSync={useSync}
        />
      </div>
      <CaptionPanelContent
        runtime={runtime}
        session={session}
        autoScroll={autoScroll}
      />
    </div>
  );
}

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

function langName(vssId: string): string {
  const code = langFromVssId(vssId);
  return displayNames.of(code) ?? code;
}
