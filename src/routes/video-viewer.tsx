import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { useParams } from "react-router";
import { orpc } from "../rpc.ts";

// --- YouTube IFrame API types ---

declare let YT: {
  Player: new (
    el: HTMLElement | string,
    options: {
      videoId: string;
      events?: {
        onReady?: () => void;
      };
    },
  ) => YTPlayer;
};

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

// --- YouTube IFrame API loader (singleton) ---

let iframeApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
    // YT API calls this global when ready
    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady =
      () => {
        resolve();
      };
  });
  return iframeApiPromise;
}

async function createYoutubePlayer(
  el: HTMLElement,
  videoId: string,
): Promise<YTPlayer> {
  await loadYoutubeIframeApi();
  return new Promise<YTPlayer>((resolve) => {
    const player = new YT.Player(el, {
      videoId,
      events: { onReady: () => resolve(player) },
    });
  });
}

// --- useYouTubePlayer hook ---

function useYouTubePlayer(youtubeId: string | undefined) {
  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const ref: RefCallback<HTMLDivElement> = useCallback(
    (el) => {
      if (!el || !youtubeId || playerRef.current) return;
      createYoutubePlayer(el, youtubeId).then((p) => {
        playerRef.current = p;
        setPlayer(p);
      });
    },
    [youtubeId],
  );

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return { ref, player };
}

// --- Helpers ---

type Caption = {
  id: number;
  videoId: number;
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

function findCurrentEntry(
  entries: Caption[],
  time: number,
): number | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].begin <= time) {
      return i;
    }
  }
  return undefined;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Text selection for bookmarking ---

interface BookmarkSelection {
  captionEntryIndex: number;
  side: number;
  offset: number;
  text: string;
}

function extractBookmarkSelection(
  selection: Selection,
): BookmarkSelection | undefined {
  const text = selection.toString();
  if (!text.trim()) return;
  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  const { startContainer, startOffset, endContainer } = range;
  if (
    startContainer.nodeType !== Node.TEXT_NODE ||
    endContainer.nodeType !== Node.TEXT_NODE
  )
    return;

  // Walk up: text node → span[data-offset] → div[data-side] → div(flex) → div[data-index]
  const startEl = startContainer.parentElement;
  const endEl = endContainer.parentElement;
  const dataOffset = startEl?.getAttribute("data-offset");
  if (!startEl || !endEl || !dataOffset) return;

  const sideEl = startEl.parentElement;
  const dataSide = sideEl?.getAttribute("data-side");
  if (!sideEl || !dataSide || startEl.parentElement !== endEl.parentElement)
    return;

  const indexEl = sideEl.parentElement?.parentElement;
  const dataIndex = indexEl?.getAttribute("data-index");
  if (!indexEl || !dataIndex) return;

  return {
    captionEntryIndex: Number(dataIndex),
    side: Number(dataSide),
    offset: Number(dataOffset) + startOffset,
    text,
  };
}

// --- Components ---

type Bookmark = {
  id: number;
  videoId: number;
  captionId: number | null;
  text: string;
  side: number;
  offset: number;
  translation: string;
  context: string;
  timestamp: number;
  etymology: string;
  notes: string;
  status: string;
};

function highlightText(
  text: string,
  marks: { offset: number; length: number; bookmark: Bookmark }[],
  onGoToBookmark?: (bookmarkId: number) => void,
  popoverState?: {
    activeBookmarkId: number | null;
    onHoverBookmark: (id: number) => void;
    onLeaveBookmark: () => void;
    scrollElementRef: React.RefObject<HTMLDivElement | null>;
  },
) {
  if (marks.length === 0) return <span data-offset={0}>{text}</span>;
  const sorted = [...marks].sort((a, b) => a.offset - b.offset);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.offset > cursor)
      parts.push(
        <span key={`t${cursor}`} data-offset={cursor}>
          {text.slice(cursor, m.offset)}
        </span>,
      );
    const end = m.offset + m.length;
    parts.push(
      <BookmarkWord
        key={m.bookmark.id}
        bookmark={m.bookmark}
        offset={m.offset}
        onGoToBookmark={onGoToBookmark}
        activeBookmarkId={popoverState?.activeBookmarkId ?? null}
        onHoverBookmark={popoverState?.onHoverBookmark}
        onLeaveBookmark={popoverState?.onLeaveBookmark}
        scrollElementRef={popoverState?.scrollElementRef}
      >
        {text.slice(m.offset, end)}
      </BookmarkWord>,
    );
    cursor = end;
  }
  if (cursor < text.length)
    parts.push(
      <span key={`t${cursor}`} data-offset={cursor}>
        {text.slice(cursor)}
      </span>,
    );
  return <>{parts}</>;
}

function BookmarkWord({
  bookmark,
  offset,
  children,
  onGoToBookmark,
  activeBookmarkId,
  onHoverBookmark,
  onLeaveBookmark,
  scrollElementRef,
}: {
  bookmark: Bookmark;
  offset: number;
  children: React.ReactNode;
  onGoToBookmark?: (bookmarkId: number) => void;
  activeBookmarkId: number | null;
  onHoverBookmark?: (id: number) => void;
  onLeaveBookmark?: () => void;
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const isOpen = activeBookmarkId === bookmark.id;
  const spanRef = useRef<HTMLSpanElement>(null);
  const [popoverBelow, setPopoverBelow] = useState(false);

  useLayoutEffect(() => {
    if (!isOpen || !spanRef.current) {
      setPopoverBelow(false);
      return;
    }
    const spanRect = spanRef.current.getBoundingClientRect();
    const containerTop = scrollElementRef?.current
      ? scrollElementRef.current.getBoundingClientRect().top
      : 0;
    const spaceAbove = spanRect.top - containerTop;
    if (spaceAbove < 80) setPopoverBelow(true);
  }, [isOpen, scrollElementRef]);

  return (
    <span
      ref={spanRef}
      className="relative inline-block"
      data-offset={offset}
      onMouseEnter={() => onHoverBookmark?.(bookmark.id)}
      onMouseLeave={() => onLeaveBookmark?.()}
    >
      <span
        className={
          bookmark.status === "manual"
            ? "border-b-2 border-highlight-border bg-highlight-bg"
            : "border-b-2 border-highlight-alt-border bg-highlight-alt-bg"
        }
      >
        {children}
      </span>
      {isOpen && (
        <span
          className={`absolute left-0 z-10 w-48 rounded border border-border bg-popover p-2 shadow-lg ${
            popoverBelow ? "top-full mt-1" : "bottom-full mb-1"
          }`}
        >
          <span className="block text-xs font-medium text-popover-foreground">
            {bookmark.text}
          </span>
          <span className="block text-xs text-muted-foreground">
            {bookmark.translation}
          </span>
          {bookmark.etymology && (
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {bookmark.etymology}
            </span>
          )}
          {onGoToBookmark && (
            <span
              role="button"
              className="mt-1 block cursor-pointer text-[10px] text-accent hover:underline"
              onMouseDown={(e) => {
                e.stopPropagation();
                onGoToBookmark(bookmark.id);
              }}
            >
              Go to bookmark
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function BookmarksList({
  bookmarks,
  captions,
  player,
  videoId,
  flashBookmarkId,
  onGoToCaption,
}: {
  bookmarks: Bookmark[];
  captions: Caption[];
  player: YTPlayer | null;
  videoId: number;
  flashBookmarkId: number | null;
  onGoToCaption: (captionId: number) => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation(
    orpc.bookmarks.deleteBookmark.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: orpc.bookmarks.listBookmarks.queryOptions({
            input: { videoId, limit: 500 },
          }).queryKey,
        }),
    }),
  );

  const captionById = useMemo(() => {
    const map = new Map<number, Caption>();
    for (const c of captions) map.set(c.id, c);
    return map;
  }, [captions]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flashBookmarkId === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-bookmark-id="${flashBookmarkId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash-highlight");
    // Force reflow to restart animation
    void (el as HTMLElement).offsetWidth;
    el.classList.add("flash-highlight");
  }, [flashBookmarkId]);

  return (
    <div ref={scrollRef} className="flex flex-col gap-1.5 p-1.5">
      {bookmarks.map((bm) => {
        const caption = bm.captionId ? captionById.get(bm.captionId) : null;
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
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete bookmark "${bm.text}"?`)) {
                    deleteMutation.mutate({ id: bm.id });
                  }
                }}
              >
                ✕
              </button>
              {bm.status === "manual" && (
                <span className="rounded bg-highlight px-1 text-highlight-foreground">
                  manual
                </span>
              )}
              <span className="ml-auto">{formatTimestamp(bm.timestamp)}</span>
              {bm.captionId && (
                <button
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Go to caption"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToCaption(bm.captionId!);
                  }}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                      clipRule="evenodd"
                    />
                    <path
                      fillRule="evenodd"
                      d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className="text-sm font-medium">{bm.text}</div>
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
              <div className="mt-0.5 border-t border-border pt-1 text-xs text-muted-foreground">
                <div>{caption.text1}</div>
                <div>{caption.text2}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function VideoViewerPage() {
  const { id } = useParams<"id">();
  const videoId = Number(id);

  const videoQuery = useQuery(
    orpc.videos.getVideo.queryOptions({ input: { id: videoId } }),
  );
  const captionsQuery = useQuery(
    orpc.videos.listCaptions.queryOptions({ input: { videoId } }),
  );
  const bookmarksQuery = useQuery(
    orpc.bookmarks.listBookmarks.queryOptions({
      input: { videoId, limit: 500 },
    }),
  );

  const video = videoQuery.data;
  const captions = captionsQuery.data ?? [];
  const bookmarkItems = bookmarksQuery.data?.items ?? [];

  const sortedBookmarks = useMemo(
    () => [...bookmarkItems].sort((a, b) => a.timestamp - b.timestamp),
    [bookmarkItems],
  );

  const bookmarksByCaptionId = useMemo(() => {
    const map = new Map<number, Bookmark[]>();
    for (const bm of bookmarkItems) {
      if (!bm.captionId) continue;
      const list = map.get(bm.captionId);
      if (list) list.push(bm);
      else map.set(bm.captionId, [bm]);
    }
    return map;
  }, [bookmarkItems]);

  const { ref: playerRef, player } = useYouTubePlayer(video?.youtubeId);

  const [currentIndex, setCurrentIndex] = useState<number | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"captions" | "bookmarks">(
    "captions",
  );
  const currentTimeRef = useRef(0);
  const [bookmarkSelection, setBookmarkSelection] =
    useState<BookmarkSelection>();
  const [flashBookmarkId, setFlashBookmarkId] = useState<number | null>(null);
  const flashBookmarkCounter = useRef(0);
  const [flashCaptionIndex, setFlashCaptionIndex] = useState<number | null>(
    null,
  );
  const flashCaptionCounter = useRef(0);

  // Shared popover state – only one bookmark popover open at a time
  const [activeBookmarkId, setActiveBookmarkId] = useState<number | null>(null);
  const activeBookmarkTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  function onHoverBookmark(id: number) {
    if (activeBookmarkTimer.current) clearTimeout(activeBookmarkTimer.current);
    setActiveBookmarkId(id);
  }
  function onLeaveBookmark() {
    activeBookmarkTimer.current = setTimeout(
      () => setActiveBookmarkId(null),
      300,
    );
  }

  const queryClient = useQueryClient();
  const createBookmarkMutation = useMutation(
    orpc.bookmarks.createBookmarks.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.bookmarks.listBookmarks.queryOptions({
            input: { videoId, limit: 500 },
          }).queryKey,
        });
        setBookmarkSelection(undefined);
      },
    }),
  );

  // Selection change listener
  useEffect(() => {
    const handler = () => {
      const sel = document.getSelection() ?? undefined;
      setBookmarkSelection(sel ? extractBookmarkSelection(sel) : undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  function onClickBookmark() {
    if (!bookmarkSelection) return;
    const entry = captions[bookmarkSelection.captionEntryIndex];
    if (!entry) return;
    createBookmarkMutation.mutate({
      bookmarks: [
        {
          videoId,
          captionId: entry.id,
          text: bookmarkSelection.text,
          side: bookmarkSelection.side,
          offset: bookmarkSelection.offset,
          timestamp: entry.begin,
          status: "manual",
        },
      ],
    });
    document.getSelection()?.removeAllRanges();
  }

  function onCancelBookmark() {
    document.getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
  }

  // Auto-scroll toggle (persisted)
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      const stored = localStorage.getItem("ytsub:auto-scroll");
      return stored !== null ? (JSON.parse(stored) as boolean) : true;
    } catch {
      return true;
    }
  });
  function toggleAutoScroll() {
    setAutoScroll((prev) => {
      const next = !prev;
      localStorage.setItem("ytsub:auto-scroll", JSON.stringify(next));
      return next;
    });
  }

  // Pause auto-scroll during manual interaction
  const isManualScrollRef = useRef(false);
  const setDebouncedTimeout = useDebouncedTimeout();
  function onManualScroll() {
    isManualScrollRef.current = true;
    setDebouncedTimeout(() => {
      isManualScrollRef.current = false;
    }, 2000);
  }

  // Virtualizer
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: captions.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const captionIndexById = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < captions.length; i++) map.set(captions[i].id, i);
    return map;
  }, [captions]);

  function onGoToCaption(captionId: number) {
    const index = captionIndexById.get(captionId);
    if (index === undefined) return;
    setActiveTab("captions");
    isManualScrollRef.current = true;
    const counter = ++flashCaptionCounter.current;
    setFlashCaptionIndex(index);
    // Delay scroll to let the tab switch render
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
    });
    setTimeout(() => {
      if (flashCaptionCounter.current === counter) setFlashCaptionIndex(null);
    }, 1000);
  }

  function onGoToBookmark(bookmarkId: number) {
    const counter = ++flashBookmarkCounter.current;
    setFlashBookmarkId(bookmarkId);
    setActiveTab("bookmarks");
    setTimeout(() => {
      if (flashBookmarkCounter.current === counter) setFlashBookmarkId(null);
    }, 1000);
  }

  // RAF loop — poll player time, update current entry, auto-scroll
  useEffect(() => {
    if (!player || captions.length === 0) return;

    let rafId: number;
    const loop = () => {
      const playing = player.getPlayerState() === 1;
      setIsPlaying(playing);

      if (playing) {
        const time = player.getCurrentTime();
        currentTimeRef.current = time;
        const nextIndex = findCurrentEntry(captions, time);

        setCurrentIndex((prev) => {
          if (
            nextIndex !== prev &&
            nextIndex !== undefined &&
            autoScroll &&
            !isManualScrollRef.current
          ) {
            const scrollEl = scrollElementRef.current;
            if (scrollEl) {
              const { scrollTop, clientHeight } = scrollEl;
              const currentCenter = scrollTop + clientHeight / 2;
              const threshold = clientHeight / 6;
              const items = virtualizer.getVirtualItems();
              const item = items.find((it) => it.index === nextIndex);
              if (!item || Math.abs(item.start - currentCenter) > threshold) {
                virtualizer.scrollToIndex(nextIndex, {
                  align: "center",
                  behavior: "smooth",
                });
              }
            }
          }
          return nextIndex;
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [player, captions, virtualizer, autoScroll]);

  // Click-to-seek
  function onClickEntry(index: number) {
    if (!player) return;
    // Don't seek if user is selecting text
    if (document.getSelection()?.toString()) return;
    isManualScrollRef.current = false;

    const entry = captions[index];
    if (index === currentIndex) {
      // Toggle play/pause on current entry
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    } else {
      player.seekTo(entry.begin);
      player.playVideo();
    }
  }

  // Bookmark navigation — read time directly from player to avoid stale ref
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
    // Wrap to last
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
    // Wrap to first
    player.seekTo(sortedBookmarks[0].timestamp);
    player.playVideo();
  }

  if (videoQuery.isLoading || captionsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (videoQuery.isError || !video) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">Failed to load video.</p>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full w-full flex-col lg:flex-row lg:gap-2 lg:p-2">
      {/* YouTube embed */}
      <div className="flex-none lg:flex-1">
        <div className="flex justify-center">
          <div className="relative w-full max-w-xl lg:max-w-none">
            <div className="relative pt-[56.2%]">
              <div className="absolute top-0 h-full w-full" ref={playerRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Caption panel */}
      <div className="relative flex min-h-0 flex-[1_0_0] flex-col border-t lg:w-1/3 lg:flex-none lg:border lg:rounded">
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
            <button
              className={[
                "rounded p-0.5",
                autoScroll
                  ? "text-accent hover:bg-highlight-bg"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
              onClick={toggleAutoScroll}
              title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {sortedBookmarks.length > 0 && (
              <div className="flex gap-0.5">
                <button
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={onPrevBookmark}
                  title="Previous bookmark"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={onNextBookmark}
                  title="Next bookmark"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Captions scroll area — hidden (not unmounted) to preserve virtualizer */}
        <div
          className="h-full flex-[1_0_0] overflow-y-auto"
          ref={scrollElementRef}
          style={{ display: activeTab === "captions" ? undefined : "none" }}
          onWheel={onManualScroll}
          onTouchStart={onManualScroll}
        >
          {captions.length > 0 && virtualItems.length > 0 && (
            <div
              className="relative flex flex-col"
              style={{ height: virtualizer.getTotalSize() }}
            >
              <div
                className="absolute left-0 top-0 flex w-full flex-col gap-1.5 px-1.5"
                style={{
                  transform: `translateY(${virtualItems[0].start}px)`,
                }}
              >
                {virtualItems.map((item) => {
                  const entry = captions[item.index];
                  const isCurrent = item.index === currentIndex;
                  const isEntryPlaying = isCurrent && isPlaying;
                  const entryBookmarks = bookmarksByCaptionId.get(entry.id);
                  const text1Marks = entryBookmarks
                    ?.filter((b) => b.side === 0)
                    .map((b) => ({
                      offset: b.offset,
                      length: b.text.length,
                      bookmark: b,
                    }));
                  const text2Marks = entryBookmarks
                    ?.filter((b) => b.side === 1)
                    .map((b) => ({
                      offset: b.offset,
                      length: b.text.length,
                      bookmark: b,
                    }));

                  return (
                    <div
                      key={item.key}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      className={[
                        "flex w-full flex-col gap-1 border p-1 px-2 hover:bg-muted",
                        isEntryPlaying && "ring-2 ring-ring",
                        isCurrent ? "border-ring" : "border-border",
                        item.index === flashCaptionIndex && "flash-highlight",
                        item.index === 0 && "mt-1.5",
                        item.index === captions.length - 1 && "mb-1.5",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span className="ml-auto">
                          {formatTimestamp(entry.begin)} –{" "}
                          {formatTimestamp(entry.end)}
                        </span>
                      </div>
                      <div
                        className="flex cursor-pointer text-sm"
                        onClick={() => onClickEntry(item.index)}
                      >
                        <div className="flex-1 border-r pr-2" data-side="0">
                          {highlightText(
                            entry.text1,
                            text1Marks ?? [],
                            onGoToBookmark,
                            {
                              activeBookmarkId,
                              onHoverBookmark,
                              onLeaveBookmark,
                              scrollElementRef,
                            },
                          )}
                        </div>
                        <div className="flex-1 pl-2" data-side="1">
                          {highlightText(
                            entry.text2,
                            text2Marks ?? [],
                            onGoToBookmark,
                            {
                              activeBookmarkId,
                              onHoverBookmark,
                              onLeaveBookmark,
                              scrollElementRef,
                            },
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              <BookmarksList
                bookmarks={sortedBookmarks}
                captions={captions}
                player={player}
                videoId={videoId}
                flashBookmarkId={flashBookmarkId}
                onGoToCaption={onGoToCaption}
              />
            )}
          </div>
        )}

        {/* Floating bookmark action buttons */}
        {(bookmarkSelection || createBookmarkMutation.isPending) && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shadow hover:bg-muted/80"
              onClick={onCancelBookmark}
              title="Cancel"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow hover:bg-accent/90"
              onClick={onClickBookmark}
              disabled={createBookmarkMutation.isPending}
              title="Create bookmark"
            >
              {createBookmarkMutation.isPending ? (
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function useDebouncedTimeout() {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (callback: () => void, timeoutMs: number) => {
    if (ref.current !== null) {
      clearTimeout(ref.current);
    }
    ref.current = setTimeout(() => {
      callback();
      ref.current = null;
    }, timeoutMs);
  };
}
