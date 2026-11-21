import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { type MergeStrategy, mergeCaptions } from "../lib/caption-merge.ts";
import {
  CaptionSessionManager,
  getInitialTracks,
  saveSelectedTracks,
} from "../lib/caption-session.ts";
import { captionStorage } from "../lib/caption-storage.ts";
import type { UseSync } from "../lib/sync.ts";
import type {
  Json3File,
  YouTubeCaptionTrack,
  YouTubeVideoData,
} from "../lib/youtube.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";
import { CaptionPanelContent } from "./caption-panel-content.tsx";
import {
  SettingsDropdown,
  SettingsDropdownSkeleton,
} from "./settings-menu.tsx";
import { TrackPicker } from "./track-picker.tsx";
import { withUseValue } from "./use-store-value.ts";
import type { YTPlayer } from "./youtube-player.tsx";

const DEFAULT_PREFERENCES = { autoScroll: true, fabOpen: {} };

const preferencesSchema = z
  .object({
    autoScroll: z.boolean().catch(DEFAULT_PREFERENCES.autoScroll),
    fabOpen: z
      .record(z.string(), z.boolean())
      .catch(DEFAULT_PREFERENCES.fabOpen),
  })
  .catch(DEFAULT_PREFERENCES);

const preferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:caption-panel",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);

type CaptionPanelProps = {
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
      const session = await captionStorage.getSession(youtubeId);
      if (!session) {
        return null;
      }
      return new CaptionSessionManager({
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

/** State B: tracks selected, fetching json3 → builds store and calls setStore */
function CaptionPanelLoading({
  tracks,
  fetchJson3,
  videoMeta,
  track1,
  track2,
  userStrategy,
  onSelectTracks,
  setStore,
}: {
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

async function buildCaptionSession(options: {
  track1: YouTubeCaptionTrack;
  track2: YouTubeCaptionTrack;
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  videoMeta: YouTubeVideoData;
  strategy?: MergeStrategy;
}): Promise<CaptionSessionManager> {
  const [json3_1, json3_2] = await Promise.all([
    options.fetchJson3(options.track1),
    options.fetchJson3(options.track2),
  ]);
  const merged = mergeCaptions(
    { json3: json3_1, vssId: options.track1.vssId },
    { json3: json3_2, vssId: options.track2.vssId },
    options.strategy,
  );
  const store = new CaptionSessionManager({
    videoMeta: options.videoMeta,
    vssId1: options.track1.vssId,
    vssId2: options.track2.vssId,
    rows: merged.captions,
    strategy: merged.strategy,
    bookmarks: [],
  });
  await store.persistSession();
  return store;
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

  const [autoScroll, setAutoScroll] = preferences.useValue("autoScroll");

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
  const code = vssId.split(".").pop()!;
  return displayNames.of(code) ?? code;
}

export function useFabOpen(videoId: string) {
  const [fabOpen, setFabOpen] = preferences.useValue("fabOpen");
  const open = fabOpen[videoId] ?? false;
  const toggle = () => setFabOpen((prev) => ({ ...prev, [videoId]: !open }));
  return [open, toggle] as const;
}

export function CaptionFab({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-testid="caption-fab"
      type="button"
      onClick={onClick}
      className={`fixed right-3 bottom-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none shadow-lg pointer-events-auto ${open ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}
      title={open ? "Hide captions" : "Show captions"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-8"
        viewBox="0 0 128 128"
      >
        <path
          d="M28,36 h72 v12 l-52,32 h52 v12 h-72 v-12 l52,-32 h-52 z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
