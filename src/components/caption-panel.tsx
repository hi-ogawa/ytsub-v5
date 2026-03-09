import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Check,
  Download,
  EllipsisVertical,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_STRATEGIES,
  type MergeStrategy,
  type MergedCaption,
  mergeCaptions,
} from "../lib/caption-merge.ts";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  extractBookmarkSelection,
} from "../lib/extension-bookmarks.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  pickBestTrack,
} from "../lib/youtube.ts";
import { CaptionList } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
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

// --- Track preference persistence ---

const TRACKS_KEY = "zamak:selected-tracks";
const LANGS_KEY = "zamak:preferred-langs";

function getInitialTracks(
  tracks: YouTubeCaptionTrack[],
  videoId: string,
): { vssId1?: string; vssId2?: string } {
  try {
    // Per-video: restore exact track pair
    const perVideo = localStorage.getItem(`${TRACKS_KEY}:${videoId}`);
    if (perVideo) {
      const { vssId1, vssId2 } = JSON.parse(perVideo);
      // Validate that saved vssIds still exist in available tracks
      const valid1 = tracks.some((t) => t.vssId === vssId1);
      const valid2 = tracks.some((t) => t.vssId === vssId2);
      if (valid1 && valid2) return { vssId1, vssId2 };
    }
    // Global: preferred languages → pickBestTrack
    const globalPref = localStorage.getItem(LANGS_KEY);
    if (globalPref) {
      const { lang1, lang2 } = JSON.parse(globalPref);
      return {
        vssId1: pickBestTrack(tracks, lang1)?.vssId,
        vssId2: pickBestTrack(tracks, lang2)?.vssId,
      };
    }
  } catch {}
  // No preference initially
  return {};
}

function saveSelectedTracks(
  tracks: YouTubeCaptionTrack[],
  vssId1: string,
  vssId2: string,
  videoId: string,
) {
  localStorage.setItem(
    `${TRACKS_KEY}:${videoId}`,
    JSON.stringify({ vssId1, vssId2 }),
  );
  const t1 = tracks.find((t) => t.vssId === vssId1);
  const t2 = tracks.find((t) => t.vssId === vssId2);
  if (t1 && t2) {
    localStorage.setItem(
      LANGS_KEY,
      JSON.stringify({ lang1: t1.languageCode, lang2: t2.languageCode }),
    );
  }
}

// --- CaptionPanel: live mode (track selection + fetching + merge) ---

export function CaptionPanel({
  tracks,
  fetchJson3,
  player,
  videoMeta,
  onCreateBookmark,
  bookmarksByIndex,
}: {
  tracks: YouTubeCaptionTrack[];
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  player: YTPlayer | null;
  videoMeta: VideoMeta;
  onCreateBookmark?: (
    sel: BookmarkSelection & { timestamp: number; context: string },
  ) => void;
  bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
}) {
  const [{ vssId1: selectedVssId1, vssId2: selectedVssId2 }, setSelectedPair] =
    useState(() => getInitialTracks(tracks, videoMeta.youtubeId));
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      const stored = localStorage.getItem("zamak:auto-scroll");
      return stored !== null ? (JSON.parse(stored) as boolean) : true;
    } catch {
      return true;
    }
  });
  const [forceStrategy, setForceStrategy] = useState<
    MergeStrategy | undefined
  >();

  const sel1 = tracks.find((t) => t.vssId === selectedVssId1);
  const sel2 = tracks.find((t) => t.vssId === selectedVssId2);

  const json3Query1 = useQuery({
    queryKey: ["json3", sel1?.vssId],
    queryFn: () => fetchJson3(sel1!),
    enabled: !!sel1,
  });

  const json3Query2 = useQuery({
    queryKey: ["json3", sel2?.vssId],
    queryFn: () => fetchJson3(sel2!),
    enabled: !!sel2,
  });

  const json3_1 = json3Query1.data;
  const json3_2 = json3Query2.data;
  const mergeResult =
    json3_1 && json3_2 && sel1 && sel2
      ? mergeCaptions(
          { json3: json3_1, vssId: sel1.vssId },
          { json3: json3_2, vssId: sel2.vssId },
          forceStrategy,
        )
      : undefined;
  const rows = mergeResult?.captions;
  const activeStrategy = mergeResult?.strategy;
  const isAutoStrategy =
    !forceStrategy &&
    (activeStrategy === "strict" || activeStrategy === "relaxed-strict");

  const cueError = json3Query1.error ?? json3Query2.error;

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
    if (!onCreateBookmark) return;
    const handler = () => {
      const sel = document.getSelection() ?? undefined;
      setBookmarkSelection(sel ? extractBookmarkSelection(sel) : undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [onCreateBookmark]);

  function onClickBookmark() {
    if (!bookmarkSelection || !onCreateBookmark || !rows) return;
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

  function handleExport() {
    if (!rows) return;
    // Collect all bookmarks across all indices for export
    const allBookmarks: ExtensionBookmark[] = [];
    if (bookmarksByIndex) {
      for (const bms of bookmarksByIndex.values()) {
        allBookmarks.push(...bms);
      }
    }
    const data = {
      video: {
        youtubeId: videoMeta.youtubeId,
        title: videoMeta.title,
        channelName: videoMeta.channelName ?? "",
        channelId: videoMeta.channelId ?? "",
        duration: videoMeta.duration ?? 0,
        language1: sel1?.languageCode ?? "ko",
        language2: sel2?.languageCode ?? "en",
      },
      captions: rows.map((r, i) => ({
        idx: i,
        begin: r.begin,
        end: r.end,
        text1: r.text1,
        text2: r.text2,
      })),
      bookmarks: allBookmarks.map((b) => ({
        text: b.text,
        translation: b.translation,
        etymology: b.etymology,
        notes: b.notes,
        captionIdx: b.captionIndex,
        side: b.side,
        offset: b.offset,
        context: b.context,
        status: "manual",
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${videoMeta.youtubeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={selectedVssId1}
            selectedVssId2={selectedVssId2}
            onSelect={(v1, v2) => {
              setSelectedPair({ vssId1: v1, vssId2: v2 });
              if (v1 && v2)
                saveSelectedTracks(tracks, v1, v2, videoMeta.youtubeId);
            }}
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
                  className="w-full rounded border bg-background px-1 py-0.5 text-sm"
                  value={forceStrategy ?? activeStrategy ?? ""}
                  onChange={(e) =>
                    setForceStrategy(
                      (e.target.value as MergeStrategy) || undefined,
                    )
                  }
                  title="Alignment strategy"
                >
                  {FALLBACK_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DropdownMenuItem onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export import.json
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative flex min-h-0 flex-[1_0_0] flex-col">
        {cueError ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {String(cueError)}
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
        {onCreateBookmark && (bookmarkSelection || isCreating) && (
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
