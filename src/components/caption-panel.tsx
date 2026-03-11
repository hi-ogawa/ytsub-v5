import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  Loader2,
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
} from "react";
import {
  ALL_STRATEGIES,
  type MergeStrategy,
  type MergedCaption,
} from "../lib/caption-merge.ts";
import type {
  CaptionSession_Hook,
  CaptionSessionStore,
} from "../lib/caption-session.ts";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  extractBookmarkSelection,
} from "../lib/extension-bookmarks.ts";
import { useLocalStorage } from "../lib/use-local-storage.ts";
import type { YouTubeCaptionTrack } from "../lib/youtube.ts";
import { CaptionList } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

export function CaptionFab({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
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

const AI_PROMPTS: { label: string; task: string }[] = [
  { label: "Pick & Fill", task: "Pick & Fill" },
  { label: "Fill Bookmarks", task: "Fill Bookmarks" },
  { label: "Fix Korean ASR", task: "Fix Korean ASR" },
];

function makePrompt(task: string): string {
  return `This page has a language learning tool (zamak) injected as window.__zamak. It exposes methods to read captions/bookmarks and write bookmark metadata. Run window.__zamak.log.skillPrompt() and read the console output — it contains the full API reference and task instructions. Follow the "${task}" task. All data is read via console logs (prefixed ZAMAK:), not return values. If any API call errors, stop and report — do not try to fix it.`;
}

function AiPromptCopy() {
  const [selected, setSelected] = useState(AI_PROMPTS[0].task);
  const [copied, setCopied] = useState(false);

  function copyPrompt(task: string) {
    navigator.clipboard.writeText(makePrompt(task));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="px-2 py-1.5">
      <label className="mb-1 block text-xs text-muted-foreground">
        AI prompt
      </label>
      <div className="flex gap-1">
        <select
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            copyPrompt(e.target.value);
          }}
        >
          {AI_PROMPTS.map((p) => (
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
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// --- CaptionPanel: display component ---

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CaptionPanel({
  tracks,
  player,
  session: { store, error, selectTracks, selectStrategy, vssId1, vssId2 },
}: {
  tracks: YouTubeCaptionTrack[];
  player: YTPlayer | null;
  session: CaptionSession_Hook;
}) {
  const [autoScroll, setAutoScroll] = useLocalStorage(
    "zamak:auto-scroll",
    true,
  );

  const tracksLocked = store ? store.bookmarks.length > 0 : false;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={vssId1}
            selectedVssId2={vssId2}
            onSelect={(v1, v2) => selectTracks(v1, v2)}
            disabled={tracksLocked}
          />
        </div>
        {store && (
          <SettingsDropdown
            store={store}
            autoScroll={autoScroll}
            onSetAutoScroll={setAutoScroll}
            onSelectStrategy={selectStrategy}
          />
        )}
      </div>

      {error ? (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          {String(error)}
        </div>
      ) : !store ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading subtitles…
        </div>
      ) : (
        <CaptionPanelContent
          store={store}
          player={player}
          autoScroll={autoScroll}
        />
      )}
    </div>
  );
}

// --- SettingsDropdown ---

function SettingsDropdown({
  store,
  autoScroll,
  onSetAutoScroll,
  onSelectStrategy,
}: {
  store: CaptionSessionStore;
  autoScroll: boolean;
  onSetAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSelectStrategy: (s: MergeStrategy) => void;
}) {
  const hasBookmarks = store.bookmarks.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        title="Settings"
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-checked={autoScroll}
          onSelect={(e) => {
            e.preventDefault();
            onSetAutoScroll((v) => !v);
          }}
        >
          <Check
            className={`mr-2 h-4 w-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
          />
          Auto-scroll
        </DropdownMenuItem>
        <div className="px-2 py-1.5">
          <label className="mb-1 block text-xs text-muted-foreground">
            Track alignment
          </label>
          <select
            className={`w-full rounded border bg-background px-1 py-0.5 text-sm ${hasBookmarks ? "cursor-not-allowed opacity-50" : ""}`}
            value={store.strategy}
            onChange={(e) => onSelectStrategy(e.target.value as MergeStrategy)}
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
        <AiPromptCopy />
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
          <Download className="mr-2 h-4 w-4" />
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
          <Trash2 className="mr-2 h-4 w-4" />
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
  store: CaptionSessionStore;
  player: YTPlayer | null;
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
  const captionListRef = useRef<{ scrollToIndex: (index: number) => void }>(
    null,
  );
  const [flashBookmarkId, setFlashBookmarkId] = useState<string | null>(null);
  const flashBookmarkCounter = useRef(0);

  function onGoToCaption(captionIndex: number) {
    setActiveTab("captions");
    requestAnimationFrame(() => {
      captionListRef.current?.scrollToIndex(captionIndex);
    });
  }

  function onGoToBookmark(bookmarkId: string) {
    const counter = ++flashBookmarkCounter.current;
    setFlashBookmarkId(bookmarkId);
    setActiveTab("bookmarks");
    setTimeout(() => {
      if (flashBookmarkCounter.current === counter) setFlashBookmarkId(null);
    }, 1000);
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
      <div className="flex flex-none items-center gap-1 border-b px-2 py-1">
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
          {sortedBookmarks.length > 0 && (
            <div className="flex gap-0.5">
              <button
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={onPrevBookmark}
                title="Previous bookmark"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={onNextBookmark}
                title="Next bookmark"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
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

        {/* Bookmarks list */}
        {activeTab === "bookmarks" && (
          <div className="flex-[1_0_0] overflow-y-auto">
            {sortedBookmarks.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No bookmarks yet
                </p>
              </div>
            ) : (
              <ExtensionBookmarksList
                bookmarks={sortedBookmarks}
                rows={store.rows}
                player={player}
                onDeleteBookmark={(id) => store.deleteBookmark(id)}
                onGoToCaption={onGoToCaption}
                flashBookmarkId={flashBookmarkId}
              />
            )}
          </div>
        )}

        {/* Floating bookmark action buttons */}
        {(bookmarkSelection || isCreating) && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shadow hover:bg-muted/80"
              onClick={onCancelBookmark}
              title="Cancel"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow hover:bg-accent/90"
              onClick={onClickBookmark}
              disabled={isCreating}
              title="Create bookmark"
            >
              {isCreating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Bookmark className="h-5 w-5 fill-current" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ExtensionBookmarksList ---

function ExtensionBookmarksList({
  bookmarks,
  rows,
  player,
  onDeleteBookmark,
  onGoToCaption,
  flashBookmarkId,
}: {
  bookmarks: ExtensionBookmark[];
  rows: MergedCaption[];
  player: YTPlayer | null;
  onDeleteBookmark: (id: string) => void;
  onGoToCaption: (captionIndex: number) => void;
  flashBookmarkId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flashBookmarkId === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-bookmark-id="${flashBookmarkId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash-highlight");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("flash-highlight");
  }, [flashBookmarkId]);

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
                  <EllipsisVertical className="h-3.5 w-3.5" />
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
                    <Trash2 className="mr-2 h-4 w-4" />
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
              <div className="text-xs text-muted-foreground">
                {bm.etymology}
              </div>
            )}
            {bm.notes && (
              <div className="text-xs text-muted-foreground">{bm.notes}</div>
            )}
            {caption && (
              <div className="mt-0.5 flex items-start gap-1 border-t border-border pt-1 text-xs text-muted-foreground">
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
                    <ExternalLink className="h-3.5 w-3.5" />
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

interface CaptionViewerHandle {
  scrollToIndex: (index: number) => void;
}

function CaptionViewer({
  ref,
  rows,
  player,
  autoScroll,
  bookmarks,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  ref?: React.Ref<CaptionViewerHandle>;
  rows: MergedCaption[];
  player: YTPlayer | null;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const captionListRef = useRef<{ scrollToIndex: (index: number) => void }>(
    null,
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      captionListRef.current?.scrollToIndex(index);
    },
  }));

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
      ref={captionListRef}
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
