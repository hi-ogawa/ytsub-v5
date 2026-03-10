import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
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
import { type AiTask, AI_TASKS, makeAiPrompt } from "../lib/ai-prompt.ts";
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
}: {
  rows: MergedCaption[] | undefined;
  bookmarks: ExtensionBookmark[];
  title: string;
  duration: number | undefined;
}) {
  const [selected, setSelected] = useState<AiTask>(AI_TASKS[0].task);
  const [copied, setCopied] = useState(false);

  function copyPrompt(task: AiTask) {
    if (!rows) return;
    navigator.clipboard.writeText(
      makeAiPrompt(task, rows, bookmarks, title, duration),
    );
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
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// --- AI import paste ---

function extractJson(text: string): string {
  // Extract JSON from markdown code block if present
  const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : text.trim();
}

function AiImportPaste({
  rows,
  onCreateBookmarks,
  onUpdateBookmarks,
  onUpdateCaptions,
}: {
  rows: MergedCaption[] | undefined;
  onCreateBookmarks: CaptionSessionManager["onCreateBookmarks"];
  onUpdateBookmarks: CaptionSessionManager["onUpdateBookmarks"];
  onUpdateCaptions: CaptionSessionManager["onUpdateCaptions"];
}) {
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showInput) {
      inputRef.current?.focus();
    }
  }, [showInput]);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const raw = e.clipboardData.getData("text");
    try {
      const json = JSON.parse(extractJson(raw));
      if (!Array.isArray(json) || json.length === 0) {
        setStatus({ type: "error", msg: "Expected a non-empty JSON array" });
        return;
      }
      const first = json[0];

      if ("captionIndex" in first && "text" in first && rows) {
        // Pick & Fill result
        const entries = json as {
          captionIndex: number;
          text: string;
          translation?: string;
          etymology?: string;
          notes?: string;
        }[];
        onCreateBookmarks(
          entries
            .filter((e) => rows[e.captionIndex])
            .map((e) => ({
              text: e.text,
              side: 0,
              offset: rows[e.captionIndex].text1.indexOf(e.text),
              captionIndex: e.captionIndex,
              timestamp: rows[e.captionIndex].begin,
              context: rows[e.captionIndex].text1,
              translation: e.translation,
              etymology: e.etymology,
              notes: e.notes,
            })),
        );
        setStatus({
          type: "success",
          msg: `Created ${entries.length} bookmarks`,
        });
      } else if ("id" in first && "translation" in first) {
        // Fill result
        const entries = json as {
          id: string;
          translation?: string;
          etymology?: string;
          notes?: string;
        }[];
        onUpdateBookmarks(
          entries.map((e) => ({
            id: e.id,
            data: {
              translation: e.translation,
              etymology: e.etymology,
              notes: e.notes,
            },
          })),
        );
        setStatus({
          type: "success",
          msg: `Filled ${entries.length} bookmarks`,
        });
      } else if ("idx" in first && "text1" in first) {
        // Fix ASR result
        onUpdateCaptions(json as { idx: number; text1?: string }[]);
        setStatus({
          type: "success",
          msg: `Updated ${json.length} captions`,
        });
      } else {
        setStatus({ type: "error", msg: "Unrecognized JSON shape" });
        return;
      }
      setTimeout(() => {
        setShowInput(false);
        setStatus(null);
      }, 1500);
    } catch {
      setStatus({ type: "error", msg: "Invalid JSON" });
    }
  }

  if (!showInput) {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setShowInput(true);
        }}
      >
        <ClipboardPaste className="mr-2 h-4 w-4" />
        Import AI result
      </DropdownMenuItem>
    );
  }

  return (
    <div className="px-2 py-1.5">
      <label className="mb-1 block text-xs text-muted-foreground">
        Paste AI result (Ctrl+V)
      </label>
      <textarea
        ref={inputRef}
        className="w-full rounded border bg-background px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        rows={2}
        placeholder="Paste JSON here..."
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setShowInput(false);
            setStatus(null);
          }
        }}
      />
      {status && (
        <p
          className={`mt-1 text-xs ${status.type === "error" ? "text-destructive" : "text-green-500"}`}
        >
          {status.msg}
        </p>
      )}
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
  session,
  videoMeta,
}: {
  tracks: YouTubeCaptionTrack[];
  player: YTPlayer | null;
  session: CaptionSessionManager;
  videoMeta?: { title: string; duration?: number };
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
    bookmarks,
    bookmarksByIndex,
    onCreateBookmarks,
    onDeleteBookmark,
    onUpdateBookmarks,
    onUpdateCaptions,
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

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<"captions" | "bookmarks">(
    "captions",
  );

  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((a, b) => a.timestamp - b.timestamp),
    [bookmarks],
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
  const panelRef = useRef<HTMLDivElement>(null);

  // Shadow DOM requires getSelection() on the shadow root, not document
  const getSelection = useCallback((): Selection | null => {
    const root = panelRef.current?.getRootNode();
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
    if (!bookmarkSelection || !rows) return;
    const row = rows[bookmarkSelection.captionIndex];
    if (!row) return;
    setIsCreating(true);
    onCreateBookmarks([
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

  function handleClearBookmarks() {
    if (!confirm("Clear all bookmarks for this video?")) return;
    onClearBookmarks();
  }

  return (
    <div ref={panelRef} className="flex h-full flex-col">
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
            <AiPromptCopy
              rows={rows}
              bookmarks={bookmarks}
              title={videoMeta?.title ?? ""}
              duration={videoMeta?.duration}
            />
            <AiImportPaste
              rows={rows}
              onCreateBookmarks={onCreateBookmarks}
              onUpdateBookmarks={onUpdateBookmarks}
              onUpdateCaptions={onUpdateCaptions}
            />
            <DropdownMenuItem onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              Export import.json
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleClearBookmarks}
              disabled={!hasBookmarks}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear bookmarks
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {String(error)}
          </div>
        ) : rows ? (
          <>
            {/* Captions — hidden (not unmounted) to preserve scroll position */}
            <div
              className="flex min-h-0 flex-[1_0_0] flex-col"
              style={{
                display: activeTab === "captions" ? undefined : "none",
              }}
            >
              <CaptionViewer
                ref={captionListRef}
                rows={rows}
                player={player}
                autoScroll={autoScroll}
                bookmarksByIndex={bookmarksByIndex}
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
                    rows={rows}
                    player={player}
                    onDeleteBookmark={onDeleteBookmark}
                    onGoToCaption={onGoToCaption}
                    flashBookmarkId={flashBookmarkId}
                  />
                )}
              </div>
            )}
          </>
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
  bookmarksByIndex,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  ref?: React.Ref<CaptionViewerHandle>;
  rows: MergedCaption[];
  player: YTPlayer | null;
  autoScroll: boolean;
  bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
  onGoToBookmark?: (bookmarkId: string) => void;
  onPopoverOpenChange?: (open: boolean) => void;
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
      bookmarksByIndex={bookmarksByIndex}
      onGoToBookmark={onGoToBookmark}
      onPopoverOpenChange={onPopoverOpenChange}
    />
  );
}
