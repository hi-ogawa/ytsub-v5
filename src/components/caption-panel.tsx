import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { captionPanelPreferences } from "../lib/caption-panel-preferences.ts";
import type {
  CaptionPanelRuntime,
  CaptionPanelState,
  CaptionSession,
} from "../lib/caption-panel-runtime.ts";
import type { UseSync } from "../lib/sync.ts";
import { langFromVssId } from "../lib/youtube.ts";
import { CaptionPanelContent } from "./caption-panel-content.tsx";
import {
  SettingsDropdown,
  SettingsDropdownSkeleton,
} from "./settings-menu.tsx";
import { TrackPicker } from "./track-picker.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

export function CaptionPanel({
  runtime,
  player,
  useSync,
}: {
  runtime: CaptionPanelRuntime;
  player?: YTPlayer;
  // Called by the sync menu each time it opens, so its queries refetch then.
  useSync: UseSync;
}) {
  const restoreQuery = useQuery({
    queryKey: ["caption-panel-restore", runtime.youtubeId],
    queryFn: () => runtime.restore().then(() => null),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => player && runtime.attachPlayer(player), [runtime, player]);

  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );

  if (restoreQuery.error) {
    return <PanelMessage error>{String(restoreQuery.error)}</PanelMessage>;
  }

  // TODO: better indicator?
  if (state.restoring) {
    return null;
  }

  if (state.session) {
    return (
      <CaptionPanelWithSession
        runtime={runtime}
        state={state}
        session={state.session}
        useSync={useSync}
      />
    );
  }

  if (!runtime.trackSource) {
    return <PanelMessage>No session available</PanelMessage>;
  }
  if (state.loadingTracks) {
    return <PanelMessage>Loading subtitles…</PanelMessage>;
  }
  if (state.tracksError) {
    return <PanelMessage error>{String(state.tracksError)}</PanelMessage>;
  }
  return <CaptionPanelLoading runtime={runtime} state={state} />;
}

function PanelMessage({
  error,
  children,
}: {
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-full items-center justify-center text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}

function CaptionPanelLoading({
  runtime,
  state,
}: {
  runtime: CaptionPanelRuntime;
  state: CaptionPanelState;
}) {
  const { selectedVssId1, selectedVssId2, building, buildError, tracks } =
    state;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={selectedVssId1}
            selectedVssId2={selectedVssId2}
            onSelect={(v1, v2) =>
              runtime.selectTracks({ vssId1: v1, vssId2: v2 })
            }
          />
        </div>
        <SettingsDropdownSkeleton />
      </div>

      {buildError ? (
        <PanelMessage error>{String(buildError)}</PanelMessage>
      ) : building ? (
        <PanelMessage>Loading subtitles…</PanelMessage>
      ) : null}
    </div>
  );
}

function CaptionPanelWithSession({
  runtime,
  state,
  session,
  useSync,
}: {
  runtime: CaptionPanelRuntime;
  state: CaptionPanelState;
  session: CaptionSession;
  useSync: UseSync;
}) {
  const [autoScroll, setAutoScroll] =
    captionPanelPreferences.useValue("autoScroll");
  const { tracks, tracksError } = state;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b gap-1">
        {tracks.length > 0 ? (
          <div className="min-w-0 flex-1">
            <TrackPicker
              tracks={tracks}
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
          tracks={tracks}
          autoScroll={autoScroll}
          onSetAutoScroll={setAutoScroll}
          useSync={useSync}
        />
      </div>
      {tracksError ? (
        <div
          className="border-b px-2 py-1 text-xs text-destructive"
          data-testid="tracks-error"
        >
          Can't load other caption tracks: {String(tracksError)}
        </div>
      ) : null}
      <CaptionPanelContent
        runtime={runtime}
        session={session}
        player={state.player}
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
