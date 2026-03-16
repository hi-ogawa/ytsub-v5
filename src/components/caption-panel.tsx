import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type AiTask,
  AI_TASKS,
  makeAiPrompt,
  parseAiResult,
  pickFillToBookmarks,
} from "../lib/ai-prompt.ts";
import {
  ALL_STRATEGIES,
  type MergeStrategy,
  type MergedCaption,
  mergeCaptions,
} from "../lib/caption-merge.ts";
import { getSession } from "../lib/caption-session-db.ts";
import {
  CaptionSessionManager,
  getInitialTracks,
  saveSelectedTracks,
} from "../lib/caption-session.ts";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  extractBookmarkSelection,
} from "../lib/extension-bookmarks.ts";
import { createLocalStorageStore, useStore } from "../lib/external-store.ts";
import type { SyncStatus } from "../lib/sync.ts";
import type {
  Json3File,
  YouTubeCaptionTrack,
  YouTubeVideoData,
} from "../lib/youtube.ts";
import { CaptionList, type CaptionListHandle } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

const autoScrollStore = createLocalStorageStore("zamak:auto-scroll", true);
const fabOpenStore = createLocalStorageStore<Record<string, boolean>>(
  "zamak:fab-open",
  {},
);

export function useFabOpen(videoId: string) {
  const [state, setState] = useStore(fabOpenStore);
  const open = state[videoId] ?? false;
  const toggle = () => setState((prev) => ({ ...prev, [videoId]: !open }));
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

const WIDTH_KEY = "zamak:panel-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

function getPanelWidth(): number {
  try {
    const stored = localStorage.getItem(WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

export function ResizablePanel({
  children,
  id,
  className,
  style,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [width, setWidth] = useState(getPanelWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const onPointerMove = (e: PointerEvent) => {
      // Dragging left = wider (panel is right-aligned)
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + (startX - e.clientX)),
      );
      setWidth(newWidth);
    };

    const onPointerUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <div
      id={id}
      className={className}
      style={{ ...style, width: `${width}px` }}
      data-testid="resizable-panel"
    >
      <div
        className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-ring/50"
        data-testid="resize-handle"
        onPointerDown={onPointerDown}
      />
      {children}
    </div>
  );
}

// --- AI prompt copy (inline dropdown widget) ---

function AiPromptCopy({
  rows,
  bookmarks,
  title,
  duration,
  youtubeId,
}: {
  rows: MergedCaption[] | undefined;
  bookmarks: ExtensionBookmark[];
  title: string;
  duration: number | undefined;
  youtubeId: string;
}) {
  const [selected, setSelected] = useState<AiTask>(AI_TASKS[0].task);
  const [copied, setCopied] = useState(false);

  function getPrompt(task: AiTask) {
    if (!rows) return "";
    return makeAiPrompt(task, rows, bookmarks, title, duration);
  }

  function copyPrompt(task: AiTask) {
    navigator.clipboard.writeText(getPrompt(task));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadPrompt(task: AiTask) {
    const text = getPrompt(task);
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zamak-${youtubeId}-prompt-${task}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-2 py-1.5">
      <label className="mb-1 block text-sm text-muted-foreground flex items-center gap-1">
        AI prompt{" "}
        <a
          href="https://github.com/hi-ogawa/ytsub-v5/blob/main/docs/ai-integration.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex align-middle text-muted-foreground/70 hover:text-foreground"
          title="How to use AI prompts"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </label>
      <div className="flex gap-1">
        <select
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as AiTask);
            copyPrompt(e.target.value as AiTask);
          }}
        >
          {AI_TASKS.map((p) => (
            <option key={p.task} value={p.task}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Copy prompt"
          onClick={() => copyPrompt(selected)}
          disabled={!rows}
        >
          {copied ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Download prompt"
          onClick={() => downloadPrompt(selected)}
          disabled={!rows}
        >
          <Download className="size-4" />
        </button>
      </div>
    </div>
  );
}

// --- AI import paste ---

function importAiResult(store: CaptionSessionManager): void {
  const raw = window.prompt("Paste AI result JSON");
  if (!raw) return;
  try {
    const result = parseAiResult(raw);
    switch (result.type) {
      case "pick-fill": {
        const { bookmarks, warnings } = pickFillToBookmarks(
          result.entries,
          store.rows,
        );
        if (bookmarks.length > 0) {
          store.createBookmarks(bookmarks);
        }
        alert(
          `Created ${bookmarks.length} bookmarks` +
            (warnings.length > 0
              ? `\n\n${warnings.length} skipped:\n${warnings.join("\n")}`
              : ""),
        );
        break;
      }
      case "fill":
        store.updateBookmarks(result.entries);
        alert(`Filled ${result.entries.length} bookmarks`);
        break;
      case "fix-asr":
        store.updateCaptions(result.entries);
        alert(`Updated ${result.entries.length} captions`);
        break;
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : "Invalid JSON");
  }
}

// --- CaptionPanel: display component ---

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

function langName(vssId: string): string {
  const code = vssId.split(".").pop()!;
  return displayNames.of(code) ?? code;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SyncMenuItem({ sync: { state, onNavigate } }: { sync: SyncStatus }) {
  const iconClass = "mr-2 size-4";
  let icon: React.ReactNode;
  let label: string;

  switch (state) {
    case "unauthenticated":
      icon = <LogIn className={`${iconClass} text-muted-foreground`} />;
      label = "Sign in to sync";
      break;
    case "checking":
      icon = <Loader2 className={`${iconClass} animate-spin`} />;
      label = "Checking…";
      break;
    case "synced":
      icon = <CheckCircle2 className={`${iconClass} text-green-500`} />;
      label = "Synced";
      break;
    case "push":
      icon = <ArrowUpFromLine className={`${iconClass} text-yellow-500`} />;
      label = "Unsynced changes";
      break;
    case "pull":
      icon = <ArrowDownToLine className={`${iconClass} text-yellow-500`} />;
      label = "Server has updates";
      break;
    case "conflict":
      icon = <AlertTriangle className={`${iconClass} text-yellow-500`} />;
      label = "Sync conflict";
      break;
    case "syncing":
      icon = <RefreshCw className={`${iconClass} animate-spin`} />;
      label = "Syncing…";
      break;
    case "error":
      icon = <AlertTriangle className={`${iconClass} text-destructive`} />;
      label = "Sync error";
      break;
  }

  return (
    <>
      <DropdownMenuItem
        onSelect={onNavigate}
        data-testid="sync-status"
        data-sync-state={state}
      >
        {icon}
        {label}
      </DropdownMenuItem>
      <div className="my-1 h-px bg-border" />
    </>
  );
}

type CaptionPanelProps = {
  tracks: YouTubeCaptionTrack[];
  player?: YTPlayer;
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  videoMeta: YouTubeVideoData;
  sync: SyncStatus;
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
      const session = await getSession(youtubeId);
      if (!session) return null;
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
  sync,
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
      sync={sync}
    />
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
  return new CaptionSessionManager({
    videoMeta: options.videoMeta,
    vssId1: options.track1.vssId,
    vssId2: options.track2.vssId,
    rows: merged.captions,
    strategy: merged.strategy,
    bookmarks: [],
  });
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

function CaptionPanelWithStore({
  store,
  sessionOnly,
  tracks,
  player,
  onSelectTracks,
  onSelectStrategy,
  sync,
}: {
  store: CaptionSessionManager;
  sessionOnly: boolean;
  tracks: YouTubeCaptionTrack[];
  player?: YTPlayer;
  onSelectTracks: (v1?: string, v2?: string) => void;
  onSelectStrategy: (s: MergeStrategy) => void;
  sync: SyncStatus;
}) {
  useSyncExternalStore(store.subscribe, () => store.version);

  const [autoScroll, setAutoScroll] = useStore(autoScrollStore);

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
          autoScroll={autoScroll}
          onSetAutoScroll={setAutoScroll}
          onSelectStrategy={onSelectStrategy}
          sync={sync}
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

// --- SettingsDropdown ---

function SettingsDropdownSkeleton() {
  return (
    <div className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-50">
      <EllipsisVertical className="size-4" />
    </div>
  );
}

function SettingsDropdown({
  store,
  autoScroll,
  onSetAutoScroll,
  onSelectStrategy,
  sync,
  sessionOnly,
}: {
  store: CaptionSessionManager;
  autoScroll: boolean;
  onSetAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSelectStrategy: (s: MergeStrategy) => void;
  sync: SyncStatus;
  sessionOnly?: boolean;
}) {
  const hasBookmarks = store.bookmarks.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        title="Settings"
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SyncMenuItem sync={sync} />
        <DropdownMenuItem
          data-checked={autoScroll}
          onSelect={(e) => {
            e.preventDefault();
            onSetAutoScroll((v) => !v);
          }}
        >
          <Check
            className={`mr-2 size-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
          />
          Auto-scroll
        </DropdownMenuItem>
        {!sessionOnly && (
          <div className="px-2 py-1.5">
            <label className="mb-1 block text-sm text-muted-foreground">
              Track alignment
            </label>
            <select
              className={`w-full rounded border bg-background px-1 py-0.5 text-sm ${hasBookmarks ? "cursor-not-allowed opacity-50" : ""}`}
              value={store.strategy}
              onChange={(e) =>
                onSelectStrategy(e.target.value as MergeStrategy)
              }
              title={
                hasBookmarks
                  ? "Cannot change while bookmarks exist"
                  : "Alignment strategy"
              }
              disabled={hasBookmarks}
            >
              {ALL_STRATEGIES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        )}
        <AiPromptCopy
          rows={store.rows}
          bookmarks={store.bookmarks}
          title={store.videoMeta.title}
          duration={store.videoMeta.duration}
          youtubeId={store.videoMeta.youtubeId}
        />
        <DropdownMenuItem onSelect={() => importAiResult(store)}>
          <ClipboardPaste className="mr-2 size-4" />
          Import AI result
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const data = store.toExportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `import-${store.videoMeta.youtubeId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="mr-2 size-4" />
          Export import.json
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (confirm("Clear all bookmarks for this video?")) {
              store.clearBookmarks();
            }
          }}
          disabled={!hasBookmarks}
        >
          <Trash2 className="mr-2 size-4" />
          Clear bookmarks
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- CaptionPanelContent: store-dependent viewer ---

function CaptionPanelContent({
  store,
  player,
  autoScroll,
}: {
  store: CaptionSessionManager;
  player?: YTPlayer;
  autoScroll: boolean;
}) {
  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<"captions" | "bookmarks">(
    "captions",
  );

  const sortedBookmarks = useMemo(
    () => [...store.bookmarks].sort((a, b) => a.timestamp - b.timestamp),
    [store.bookmarks],
  );

  // --- Bookmark navigation ---
  function onPrevBookmark() {
    if (!player || sortedBookmarks.length === 0) return;
    const time = player.getCurrentTime();
    for (let i = sortedBookmarks.length - 1; i >= 0; i--) {
      if (sortedBookmarks[i].timestamp < time - 1) {
        player.seekTo(sortedBookmarks[i].timestamp);
        player.playVideo();
        return;
      }
    }
    const last = sortedBookmarks[sortedBookmarks.length - 1];
    player.seekTo(last.timestamp);
    player.playVideo();
  }

  function onNextBookmark() {
    if (!player || sortedBookmarks.length === 0) return;
    const time = player.getCurrentTime();
    for (const bm of sortedBookmarks) {
      if (bm.timestamp > time + 0.5) {
        player.seekTo(bm.timestamp);
        player.playVideo();
        return;
      }
    }
    player.seekTo(sortedBookmarks[0].timestamp);
    player.playVideo();
  }

  // --- Cross-tab navigation ---
  const captionListRef = useRef<CaptionListHandle>(null);
  const bookmarksListRef = useRef<BookmarksListHandle>(null);

  function onGoToCaption(captionIndex: number) {
    setActiveTab("captions");
    setTimeout(() => {
      captionListRef.current?.scrollToIndex(captionIndex);
    });
  }

  function onGoToBookmark(bookmarkId: string) {
    setActiveTab("bookmarks");
    setTimeout(() => {
      bookmarksListRef.current?.scrollToBookmark(bookmarkId);
    });
  }

  // Pause auto-scroll when bookmark popover is open
  const isPopoverOpenRef = useRef(false);
  const onPopoverOpenChange = useCallback((open: boolean) => {
    isPopoverOpenRef.current = open;
  }, []);

  // --- Bookmark selection ---
  const [bookmarkSelection, setBookmarkSelection] =
    useState<BookmarkSelection>();
  const [isCreating, setIsCreating] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Shadow DOM requires getSelection() on the shadow root, not document
  const getSelection = useCallback((): Selection | null => {
    const root = contentRef.current?.getRootNode();
    if (root && "getSelection" in root) {
      return (
        root as unknown as { getSelection(): Selection | null }
      ).getSelection();
    }
    return document.getSelection();
  }, []);

  useEffect(() => {
    const handler = () => {
      const sel = getSelection() ?? undefined;
      setBookmarkSelection(sel ? extractBookmarkSelection(sel) : undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [getSelection]);

  function onClickBookmark() {
    if (!bookmarkSelection) return;
    const rows = store.rows;
    const row = rows[bookmarkSelection.captionIndex];
    if (!row) return;
    setIsCreating(true);
    store.createBookmarks([
      {
        ...bookmarkSelection,
        timestamp: row.begin,
        context: bookmarkSelection.side === 0 ? row.text1 : row.text2,
      },
    ]);
    getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
    setIsCreating(false);
  }

  function onCancelBookmark() {
    getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
  }

  return (
    <div ref={contentRef} className="flex min-h-0 flex-[1_0_0] flex-col">
      {/* Tab bar */}
      <div className="flex flex-none items-center gap-1 border-b px-2 py-0.5 lg:py-1">
        <button
          className={[
            "rounded px-2 py-0.5 text-sm",
            activeTab === "captions"
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted",
          ].join(" ")}
          onClick={() => setActiveTab("captions")}
        >
          Captions
        </button>
        <button
          className={[
            "rounded px-2 py-0.5 text-sm",
            activeTab === "bookmarks"
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted",
          ].join(" ")}
          onClick={() => setActiveTab("bookmarks")}
        >
          Bookmarks
          {sortedBookmarks.length > 0 && ` (${sortedBookmarks.length})`}
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <div className="flex gap-0.5">
            <button
              className={`rounded p-0.5 text-muted-foreground ${sortedBookmarks.length > 0 ? "hover:bg-muted" : "opacity-30"}`}
              onClick={onPrevBookmark}
              disabled={sortedBookmarks.length === 0}
              title="Previous bookmark"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              className={`rounded p-0.5 text-muted-foreground ${sortedBookmarks.length > 0 ? "hover:bg-muted" : "opacity-30"}`}
              onClick={onNextBookmark}
              disabled={sortedBookmarks.length === 0}
              title="Next bookmark"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-[1_0_0] flex-col">
        {/* Captions — hidden (not unmounted) to preserve scroll position */}
        <div
          className="flex min-h-0 flex-[1_0_0] flex-col"
          style={{
            display: activeTab === "captions" ? undefined : "none",
          }}
        >
          <CaptionViewer
            ref={captionListRef}
            rows={store.rows}
            player={player}
            autoScroll={autoScroll}
            bookmarks={store.bookmarks}
            onGoToBookmark={onGoToBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        </div>

        {/* Bookmarks — hidden (not unmounted) to preserve scroll position */}
        <div
          className="flex-[1_0_0] overflow-y-auto"
          style={{
            display: activeTab === "bookmarks" ? undefined : "none",
          }}
        >
          {sortedBookmarks.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No bookmarks yet</p>
            </div>
          ) : (
            <ExtensionBookmarksList
              ref={bookmarksListRef}
              bookmarks={sortedBookmarks}
              rows={store.rows}
              player={player}
              onDeleteBookmark={(id) => store.deleteBookmark(id)}
              onGoToCaption={onGoToCaption}
            />
          )}
        </div>

        {/* Floating bookmark action buttons */}
        {(bookmarkSelection || isCreating) && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shadow hover:bg-muted/80"
              onClick={onCancelBookmark}
              title="Cancel"
            >
              <X className="size-5" />
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow hover:bg-accent/90"
              onClick={onClickBookmark}
              disabled={isCreating}
              title="Create bookmark"
            >
              {isCreating ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Bookmark className="size-5 fill-current" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ExtensionBookmarksList ---

type BookmarksListHandle = {
  scrollToBookmark: (bookmarkId: string) => void;
};

function ExtensionBookmarksList({
  ref,
  bookmarks,
  rows,
  player,
  onDeleteBookmark,
  onGoToCaption,
}: {
  ref: React.Ref<BookmarksListHandle>;
  bookmarks: ExtensionBookmark[];
  rows: MergedCaption[];
  player?: YTPlayer;
  onDeleteBookmark: (id: string) => void;
  onGoToCaption: (captionIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBookmark: (bookmarkId: string) => {
      const el = scrollRef.current?.querySelector(
        `[data-bookmark-id="${bookmarkId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash-highlight");
        void el.offsetWidth;
        el.classList.add("flash-highlight");
      }
    },
  }));

  return (
    <div ref={scrollRef} className="flex flex-col gap-1.5 p-1.5">
      {bookmarks.map((bm) => {
        const caption = rows[bm.captionIndex];
        return (
          <div
            key={bm.id}
            data-bookmark-id={bm.id}
            className="flex cursor-pointer flex-col gap-1 border border-border p-2 hover:bg-muted"
            onClick={() => {
              if (!player) return;
              player.seekTo(bm.timestamp);
              player.playVideo();
            }}
          >
            <div className="flex items-start gap-1">
              <div className="flex-1 text-sm font-medium">{bm.text}</div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatTimestamp(bm.timestamp)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EllipsisVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete bookmark "${bm.text}"?`)) {
                        onDeleteBookmark(bm.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {bm.translation && (
              <div className="text-sm text-muted-foreground">
                {bm.translation}
              </div>
            )}
            {bm.etymology && (
              <div className="text-sm text-muted-foreground">
                {bm.etymology}
              </div>
            )}
            {bm.notes && (
              <div className="text-sm text-muted-foreground">{bm.notes}</div>
            )}
            {caption && (
              <div className="mt-0.5 flex items-start gap-1 border-t border-border pt-1 text-sm text-muted-foreground">
                <div className="flex-1">
                  <div>{caption.text1}</div>
                  <div>{caption.text2}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!bm.translation && (
                    <span className="rounded bg-muted px-1 text-muted-foreground">
                      unfilled
                    </span>
                  )}
                  <button
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Go to caption"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGoToCaption(bm.captionIndex);
                    }}
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
            {!caption && !bm.translation && (
              <div className="text-xs">
                <span className="rounded bg-muted px-1 text-muted-foreground">
                  unfilled
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- CaptionViewer: playback-synced caption list ---

function CaptionViewer({
  ref,
  rows,
  player,
  autoScroll,
  bookmarks,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  ref: React.Ref<CaptionListHandle>;
  rows: MergedCaption[];
  player?: YTPlayer;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!player || rows.length === 0) return;
    let rafId: number;

    const loop = () => {
      const playing = player.getPlayerState() === 1;
      setIsPlaying(playing);
      if (playing) {
        const time = player.getCurrentTime();
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].begin <= time) {
            setCurrentIndex(i);
            break;
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [player, rows]);

  return (
    <CaptionList
      ref={ref}
      rows={rows}
      currentIndex={currentIndex}
      isPlaying={isPlaying}
      player={player}
      autoScroll={autoScroll}
      bookmarks={bookmarks}
      onGoToBookmark={onGoToBookmark}
      onPopoverOpenChange={onPopoverOpenChange}
    />
  );
}
