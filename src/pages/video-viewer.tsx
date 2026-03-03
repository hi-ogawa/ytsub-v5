import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  Repeat,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { orpc } from "../rpc.ts";

// ─── YouTube IFrame API types ────────────────────────────────────────────────

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  pauseVideo(): void;
  playVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}

// ─── Load YouTube IFrame API once ────────────────────────────────────────────

let ytApiLoaded = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeApi(onReady: () => void) {
  if (ytApiLoaded) {
    onReady();
    return;
  }
  ytReadyCallbacks.push(onReady);
  if (document.getElementById("yt-api-script")) return;
  window.onYouTubeIframeAPIReady = () => {
    ytApiLoaded = true;
    ytReadyCallbacks.forEach((cb) => cb());
    ytReadyCallbacks.length = 0;
  };
  const script = document.createElement("script");
  script.id = "yt-api-script";
  script.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(script);
}

// ─── Caption row type ─────────────────────────────────────────────────────────

type Caption = {
  id: number;
  language: string;
  idx: number;
  begin: number;
  end: number;
  text: string;
};

type CaptionRow = {
  idx: number;
  lang1: Caption | null;
  lang2: Caption | null;
  begin: number;
  end: number;
};

function buildRows(
  caps: Caption[],
  language1: string,
  language2: string,
): CaptionRow[] {
  const byLang1 = new Map<number, Caption>();
  const byLang2 = new Map<number, Caption>();
  for (const c of caps) {
    if (c.language === language1) byLang1.set(c.idx, c);
    else if (c.language === language2) byLang2.set(c.idx, c);
  }
  const idxSet = new Set([...byLang1.keys(), ...byLang2.keys()]);
  const rows: CaptionRow[] = Array.from(idxSet)
    .sort((a, b) => a - b)
    .map((idx) => {
      const l1 = byLang1.get(idx) ?? null;
      const l2 = byLang2.get(idx) ?? null;
      const begin = l1?.begin ?? l2?.begin ?? 0;
      const end = l1?.end ?? l2?.end ?? 0;
      return { idx, lang1: l1, lang2: l2, begin, end };
    });
  return rows;
}

function findActiveIndex(rows: CaptionRow[], time: number): number {
  // Binary search for the last row whose begin <= time
  let lo = 0;
  let hi = rows.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].begin <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

// ─── Main viewer component ────────────────────────────────────────────────────

export function VideoViewer() {
  const { id } = useParams<{ id: string }>();
  const videoId = Number(id);

  const { data: video, isLoading: videoLoading } = useQuery(
    orpc.videos.get.queryOptions({ input: { id: videoId } }),
  );

  const { data: bookmarkList } = useQuery(
    orpc.bookmarks.list.queryOptions({ input: { videoId } }),
  );

  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Build caption rows once data is available
  const rows =
    video && video.captions.length > 0
      ? buildRows(video.captions as Caption[], video.language1, video.language2)
      : [];

  const activeIndex = findActiveIndex(rows, currentTime);

  // ── Virtualizer ─────────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  // Auto-scroll to active caption
  const lastScrolledIndex = useRef(-1);
  useEffect(() => {
    if (rows.length === 0) return;
    if (lastScrolledIndex.current === activeIndex) return;
    lastScrolledIndex.current = activeIndex;
    rowVirtualizer.scrollToIndex(activeIndex, { align: "center" });
  }, [activeIndex, rows.length, rowVirtualizer]);

  // ── YouTube player setup ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!video || !playerContainerRef.current) return;
    let cancelled = false;

    loadYouTubeApi(() => {
      if (cancelled || !playerContainerRef.current) return;
      new window.YT.Player(playerContainerRef.current, {
        videoId: video.youtubeId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            if (!cancelled) {
              playerRef.current = e.target;
              setPlayerReady(true);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, [video]);

  // Poll current time while video is playing
  useEffect(() => {
    if (!playerReady) return;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      setCurrentTime(t);

      // Repeat mode: loop current active row
      if (repeat && rows.length > 0) {
        const row = rows[activeIndex];
        if (row && t >= row.end) {
          p.seekTo(row.begin, true);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [playerReady, repeat, rows, activeIndex]);

  // Seek on caption click
  const handleSeek = useCallback((begin: number) => {
    playerRef.current?.seekTo(begin, true);
  }, []);

  // ── Bookmark navigation ──────────────────────────────────────────────────────
  const bookmarks = bookmarkList ?? [];
  const bookmarkIndices = (() => {
    if (!bookmarks.length || !rows.length) return [];
    return bookmarks
      .map((bm) => findActiveIndex(rows, bm.timestamp))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b);
  })();

  const handlePrevBookmark = useCallback(() => {
    const prev = [...bookmarkIndices].reverse().find((i) => i < activeIndex);
    if (prev !== undefined && rows[prev]) {
      handleSeek(rows[prev].begin);
    }
  }, [bookmarkIndices, activeIndex, rows, handleSeek]);

  const handleNextBookmark = useCallback(() => {
    const next = bookmarkIndices.find((i) => i > activeIndex);
    if (next !== undefined && rows[next]) {
      handleSeek(rows[next].begin);
    }
  }, [bookmarkIndices, activeIndex, rows, handleSeek]);

  // Set of row indices that have bookmarks
  const bookmarkedRowSet = new Set(bookmarkIndices);

  if (videoLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Video not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-2">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Videos
        </Link>
        <span className="truncate text-sm font-medium">{video.title}</span>
      </div>

      {/* Main layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: YouTube embed */}
        <div className="flex w-1/2 shrink-0 flex-col border-r border-gray-800">
          <div className="aspect-video w-full bg-black">
            <div ref={playerContainerRef} className="h-full w-full" />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 px-4 py-2">
            <button
              onClick={() => setRepeat((r) => !r)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                repeat
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Repeat current caption"
            >
              <Repeat className="h-3.5 w-3.5" />
              Repeat
            </button>

            {bookmarks.length > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 text-xs text-gray-400">
                  {bookmarks.length} bookmarks
                </span>
                <button
                  onClick={handlePrevBookmark}
                  className="rounded p-1 text-gray-400 hover:text-white"
                  title="Previous bookmark"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  onClick={handleNextBookmark}
                  className="rounded p-1 text-gray-400 hover:text-white"
                  title="Next bookmark"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Caption panel */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          style={{ contain: "strict" }}
        >
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500">No captions available.</p>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const isActive = virtualRow.index === activeIndex;
                const hasBookmark = bookmarkedRowSet.has(virtualRow.index);
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => handleSeek(row.begin)}
                    className={`flex cursor-pointer gap-px border-b border-gray-800 text-sm ${
                      isActive
                        ? "bg-indigo-950 text-white"
                        : "text-gray-300 hover:bg-gray-900"
                    }`}
                  >
                    {hasBookmark && (
                      <div className="w-1 shrink-0 self-stretch bg-indigo-500" />
                    )}
                    <div className="flex min-w-0 flex-1 gap-px">
                      <div className="min-w-0 flex-1 px-3 py-2">
                        {row.lang1?.text ?? ""}
                      </div>
                      <div className="min-w-0 flex-1 border-l border-gray-800 px-3 py-2 text-gray-400">
                        {row.lang2?.text ?? ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bookmark navigation bar (bottom) */}
      {bookmarks.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-gray-800 px-4 py-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs text-indigo-300">
            Bookmark:{" "}
            {bookmarks.find(
              (bm) => findActiveIndex(rows, bm.timestamp) === activeIndex,
            )?.text ?? "—"}
          </span>
        </div>
      )}
    </div>
  );
}
