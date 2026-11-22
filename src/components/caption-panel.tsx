import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { MergeStrategy } from "../lib/caption-merge.ts";
import { captionPanelPreferences } from "../lib/caption-panel-preferences.ts";
import {
  buildCaptionSession,
  CaptionSessionManager,
  getInitialTracks,
  saveSelectedTracks,
} from "../lib/caption-session.ts";
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

export function CaptionPanel(props: CaptionPanelProps) {
  const { youtubeId } = props.videoMeta;

  // Restore last session
  // - always fetch on mount
  // - always spinner until ready
  // - never refetch after mount
  const initialStoreQuery = useQuery({
    queryKey: ["caption-session", youtubeId],
    queryFn: async () => {
      const session = await props.storage.getSession(youtubeId);
      if (!session) {
        return null;
      }
      return new CaptionSessionManager({
        storage: props.storage,
        videoMeta: props.videoMeta,
        vssId1: session.vssId1,
        vssId2: session.vssId2,
        rows: session.captions,
        strategy: session.strategy ?? "partition",
        bookmarks: session.bookmarks,
      });
    },
    gcTime: 0,
    staleTime: Infinity,
  });

  // TODO: better indicator?
  if (initialStoreQuery.isPending) {
    return null;
  }

  return (
    <CaptionPanelInner
      {...props}
      initialStore={initialStoreQuery.data ?? undefined}
    />
  );
}

function CaptionPanelInner({
  storage,
  tracks,
  player,
  fetchJson3,
  videoMeta,
  useSync,
  sessionOnly,
  initialStore,
}: CaptionPanelProps & {
  initialStore?: CaptionSessionManager;
}) {
  const { youtubeId } = videoMeta;

  const [store, setStore] = useState(() => initialStore);
  const [selectedTracks, setSelectedTracks] = useState(() => {
    const { vssId1, vssId2 } =
      initialStore ?? getInitialTracks(tracks, youtubeId);
    return {
      track1: tracks.find((t) => t.vssId === vssId1),
      track2: tracks.find((t) => t.vssId === vssId2),
    };
  });
  const [userStrategy, setUserStrategy] = useState<MergeStrategy>();

  const selectTracks = useCallback(
    (v1?: string, v2?: string) => {
      setSelectedTracks({
        track1: tracks.find((t) => t.vssId === v1),
        track2: tracks.find((t) => t.vssId === v2),
      });
      setStore(undefined);
      if (v1 && v2) {
        saveSelectedTracks(tracks, v1, v2, youtubeId);
      }
    },
    [tracks, youtubeId],
  );

  if (!store) {
    if (sessionOnly) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No session available
        </div>
      );
    }
    return (
      <CaptionPanelLoading
        storage={storage}
        tracks={tracks}
        fetchJson3={fetchJson3}
        videoMeta={videoMeta}
        track1={selectedTracks.track1}
        track2={selectedTracks.track2}
        userStrategy={userStrategy}
        onSelectTracks={selectTracks}
        setStore={setStore}
      />
    );
  }

  return (
    <CaptionPanelWithStore
      store={store}
      sessionOnly={!!sessionOnly}
      tracks={tracks}
      player={player}
      onSelectTracks={selectTracks}
      onSelectStrategy={(s) => {
        setUserStrategy(s);
        setStore(undefined);
      }}
      useSync={useSync}
    />
  );
}

// Builds a new session from the selected tracks and hands it up with setStore.
function CaptionPanelLoading({
  storage,
  tracks,
  fetchJson3,
  videoMeta,
  track1,
  track2,
  userStrategy,
  onSelectTracks,
  setStore,
}: {
  storage: CaptionStorage;
  tracks: YouTubeCaptionTrack[];
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  videoMeta: YouTubeVideoData;
  track1?: YouTubeCaptionTrack;
  track2?: YouTubeCaptionTrack;
  userStrategy?: MergeStrategy;
  onSelectTracks: (v1?: string, v2?: string) => void;
  setStore: (store: CaptionSessionManager) => void;
}) {
  const queryClient = useQueryClient();
  const storeQuery = useQuery({
    queryKey: [
      "caption-session-build",
      videoMeta.youtubeId,
      track1?.vssId,
      track2?.vssId,
      userStrategy,
    ],
    queryFn: () => {
      return buildCaptionSession({
        storage,
        track1: track1!,
        track2: track2!,
        videoMeta,
        strategy: userStrategy,
        fetchJson3: (track) => {
          return queryClient.fetchQuery({
            queryKey: ["json3", videoMeta.youtubeId, track.vssId],
            queryFn: () => fetchJson3(track),
          });
        },
      });
    },
    enabled: !!track1 && !!track2,
    gcTime: 0,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (storeQuery.data) {
      setStore(storeQuery.data);
    }
  }, [storeQuery.data, setStore]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={track1?.vssId}
            selectedVssId2={track2?.vssId}
            onSelect={(v1, v2) => onSelectTracks(v1, v2)}
          />
        </div>
        <SettingsDropdownSkeleton />
      </div>

      {storeQuery.error ? (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          {String(storeQuery.error)}
        </div>
      ) : storeQuery.isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading subtitles…
        </div>
      ) : null}
    </div>
  );
}

function CaptionPanelWithStore({
  store,
  sessionOnly,
  tracks,
  player,
  onSelectTracks,
  onSelectStrategy,
  useSync,
}: {
  store: CaptionSessionManager;
  sessionOnly: boolean;
  tracks: YouTubeCaptionTrack[];
  player?: YTPlayer;
  onSelectTracks: (v1?: string, v2?: string) => void;
  onSelectStrategy: (s: MergeStrategy) => void;
  useSync: UseSync;
}) {
  useSyncExternalStore(store.subscribe, () => store.version);

  const [autoScroll, setAutoScroll] =
    captionPanelPreferences.useValue("autoScroll");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b gap-1">
        {!sessionOnly ? (
          <div className="min-w-0 flex-1">
            <TrackPicker
              tracks={tracks}
              selectedVssId1={store.vssId1}
              selectedVssId2={store.vssId2}
              onSelect={(v1, v2) => onSelectTracks(v1, v2)}
              disabled={store.bookmarks.length > 0}
            />
          </div>
        ) : (
          <span className="flex-1 px-2 py-1 text-sm text-muted-foreground lg:py-1.5">
            {langName(store.vssId1)} · {langName(store.vssId2)}
          </span>
        )}
        <SettingsDropdown
          store={store}
          tracks={tracks}
          autoScroll={autoScroll}
          onSetAutoScroll={setAutoScroll}
          onSelectStrategy={onSelectStrategy}
          useSync={useSync}
          sessionOnly={sessionOnly}
        />
      </div>
      <CaptionPanelContent
        store={store}
        player={player}
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
