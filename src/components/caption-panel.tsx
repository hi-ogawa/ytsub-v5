import {
  Bookmark,
  Check,
  Download,
  EllipsisVertical,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MergeStrategy, MergedCaption } from "../lib/caption-merge.ts";
import type { CaptionSessionManager } from "../lib/caption-session.ts";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  extractBookmarkSelection,
} from "../lib/extension-bookmarks.ts";
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
      className={`fixed right-3 bottom-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none text-foreground shadow-lg pointer-events-auto ${open ? "bg-[#2563eb]" : "bg-[#1a3a5c]"}`}
      title={open ? "Hide captions" : "Show captions"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-8"
        viewBox="0 0 128 128"
      >
        <path
          d="M28,36 h72 v12 l-52,32 h52 v12 h-72 v-12 l52,-32 h-52 z"
          fill="#ffffff"
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

// --- CaptionPanel: display component ---

export function CaptionPanel({
  tracks,
  player,
  session,
}: {
  tracks: YouTubeCaptionTrack[];
  player: YTPlayer | null;
  session: CaptionSessionManager;
}) {
  const {
    selectedVssId1,
    selectedVssId2,
    onSelectTracks,
    tracksLocked,
    rows,
    error,
    activeStrategy,
    isAutoStrategy,
    forceStrategy,
    onSetForceStrategy,
    fallbackStrategies,
    bookmarksByIndex,
    onCreateBookmark,
    onClearBookmarks,
    hasBookmarks,
    onExport,
  } = session;
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      const stored = localStorage.getItem("zamak:auto-scroll");
      return stored !== null ? (JSON.parse(stored) as boolean) : true;
    } catch {
      return true;
    }
  });

  function toggleAutoScroll() {
    setAutoScroll((prev) => {
      const next = !prev;
      localStorage.setItem("zamak:auto-scroll", JSON.stringify(next));
      return next;
    });
  }

  // --- Bookmark selection ---
  const [bookmarkSelection, setBookmarkSelection] =
    useState<BookmarkSelection>();
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const handler = () => {
      const sel = document.getSelection() ?? undefined;
      setBookmarkSelection(sel ? extractBookmarkSelection(sel) : undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  function onClickBookmark() {
    if (!bookmarkSelection || !rows) return;
    const row = rows[bookmarkSelection.captionIndex];
    if (!row) return;
    setIsCreating(true);
    onCreateBookmark({
      ...bookmarkSelection,
      timestamp: row.begin,
      context: bookmarkSelection.side === 0 ? row.text1 : row.text2,
    });
    document.getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
    setIsCreating(false);
  }

  function onCancelBookmark() {
    document.getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
  }

  function handleClearBookmarks() {
    if (!confirm("Clear all bookmarks for this video?")) return;
    onClearBookmarks();
  }

  return (
    <>
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={selectedVssId1}
            selectedVssId2={selectedVssId2}
            onSelect={onSelectTracks}
            disabled={tracksLocked}
          />
        </div>
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
                toggleAutoScroll();
              }}
            >
              <Check
                className={`mr-2 h-4 w-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
              />
              Auto-scroll
            </DropdownMenuItem>
            {!isAutoStrategy && (
              <div className="px-2 py-1.5">
                <label className="mb-1 block text-xs text-muted-foreground">
                  Track alignment
                </label>
                <select
                  className={`w-full rounded border bg-background px-1 py-0.5 text-sm ${tracksLocked ? "cursor-not-allowed opacity-50" : ""}`}
                  value={forceStrategy ?? activeStrategy ?? ""}
                  onChange={(e) =>
                    onSetForceStrategy(
                      (e.target.value as MergeStrategy) || undefined,
                    )
                  }
                  title={
                    tracksLocked
                      ? "Cannot change while bookmarks exist"
                      : "Alignment strategy"
                  }
                  disabled={tracksLocked}
                >
                  {fallbackStrategies.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DropdownMenuItem onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              Export import.json
            </DropdownMenuItem>
            {hasBookmarks && (
              <DropdownMenuItem onClick={handleClearBookmarks}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear bookmarks
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative flex min-h-0 flex-[1_0_0] flex-col">
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {String(error)}
          </div>
        ) : rows ? (
          <CaptionViewer
            rows={rows}
            player={player}
            autoScroll={autoScroll}
            bookmarksByIndex={bookmarksByIndex}
          />
        ) : null}

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
    </>
  );
}

// --- CaptionViewer: playback-synced caption list ---

function CaptionViewer({
  rows,
  player,
  autoScroll,
  bookmarksByIndex,
}: {
  rows: MergedCaption[];
  player: YTPlayer | null;
  autoScroll: boolean;
  bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
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
      rows={rows}
      currentIndex={currentIndex}
      isPlaying={isPlaying}
      player={player}
      autoScroll={autoScroll}
      bookmarksByIndex={bookmarksByIndex}
    />
  );
}
