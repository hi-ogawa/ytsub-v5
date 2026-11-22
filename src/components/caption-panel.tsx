import { useEffect } from "react";
import { captionPanelPreferences } from "../lib/caption-panel-preferences.ts";
import type {
  CaptionPanelRuntime,
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
import { useStoreSelector } from "./use-store-value.ts";
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
  useEffect(() => {
    void runtime.restore();
  }, [runtime]);

  useEffect(() => player && runtime.attachPlayer(player), [runtime, player]);

  const restoring = useStoreSelector(runtime.store, (s) => s.restoring);
  const session = useStoreSelector(runtime.store, (s) => s.session);
  const loadingTracks = useStoreSelector(runtime.store, (s) => s.loadingTracks);
  const tracksError = useStoreSelector(runtime.store, (s) => s.tracksError);

  // TODO: better indicator?
  if (restoring) {
    return null;
  }

  if (session) {
    return (
      <CaptionPanelWithSession
        runtime={runtime}
        session={session}
        useSync={useSync}
      />
    );
  }

  if (!runtime.trackSource) {
    return <PanelMessage>No session available</PanelMessage>;
  }
  if (loadingTracks) {
    return <PanelMessage>Loading subtitles…</PanelMessage>;
  }
  if (tracksError) {
    return <PanelMessage error>{String(tracksError)}</PanelMessage>;
  }
  return <CaptionPanelLoading runtime={runtime} />;
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

function CaptionPanelLoading({ runtime }: { runtime: CaptionPanelRuntime }) {
  const vssId1 = useStoreSelector(runtime.store, (s) => s.selectedVssId1);
  const vssId2 = useStoreSelector(runtime.store, (s) => s.selectedVssId2);
  const building = useStoreSelector(runtime.store, (s) => s.building);
  const buildError = useStoreSelector(runtime.store, (s) => s.buildError);
  const tracks = useStoreSelector(runtime.store, (s) => s.tracks);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
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
        <PanelMessage error>{String(buildError)}</PanelMessage>
      ) : building ? (
        <PanelMessage>Loading subtitles…</PanelMessage>
      ) : null}
    </div>
  );
}

function CaptionPanelWithSession({
  runtime,
  session,
  useSync,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
  useSync: UseSync;
}) {
  const [autoScroll, setAutoScroll] =
    captionPanelPreferences.useValue("autoScroll");
  const tracks = useStoreSelector(runtime.store, (s) => s.tracks);
  const tracksError = useStoreSelector(runtime.store, (s) => s.tracksError);

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
