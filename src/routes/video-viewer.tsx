import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
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
  status: string;
};

function highlightText(
  text: string,
  marks: { offset: number; length: number; bookmark: Bookmark }[],
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
      <BookmarkWord key={m.bookmark.id} bookmark={m.bookmark} offset={m.offset}>
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
}: {
  bookmark: Bookmark;
  offset: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block"
      data-offset={offset}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="border-b-2 border-amber-400 bg-amber-50">
        {children}
      </span>
      {open && (
        <span className="absolute bottom-full left-0 z-10 mb-1 w-48 rounded border bg-white p-2 shadow-lg">
          <span className="block text-xs font-medium text-gray-800">
            {bookmark.text}
          </span>
          <span className="block text-xs text-gray-500">
            {bookmark.translation}
          </span>
          {bookmark.context && (
            <span className="mt-1 block text-[10px] text-gray-400">
              {bookmark.context}
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
}: {
  bookmarks: Bookmark[];
  captions: Caption[];
  player: YTPlayer | null;
}) {
  const captionById = useMemo(() => {
    const map = new Map<number, Caption>();
    for (const c of captions) map.set(c.id, c);
    return map;
  }, [captions]);

  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      {bookmarks.map((bm) => {
        const caption = bm.captionId ? captionById.get(bm.captionId) : null;
        return (
          <div
            key={bm.id}
            className="flex cursor-pointer flex-col gap-1 border border-gray-200 p-2 hover:bg-gray-50"
            onClick={() => {
              if (!player) return;
              player.seekTo(bm.timestamp);
              player.playVideo();
            }}
          >
            <div className="flex items-center text-xs text-gray-400">
              <span className="ml-auto">{formatTimestamp(bm.timestamp)}</span>
            </div>
            <div className="text-sm font-medium">{bm.text}</div>
            {bm.translation && (
              <div className="text-sm text-gray-500">{bm.translation}</div>
            )}
            {caption && (
              <div className="mt-0.5 border-t pt-1 text-xs text-gray-400">
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

  const bookmarkedCaptionIds = useMemo(() => {
    const set = new Set<number>();
    for (const bm of bookmarkItems) {
      if (bm.captionId) set.add(bm.captionId);
    }
    return set;
  }, [bookmarkItems]);

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
        },
      ],
    });
    document.getSelection()?.removeAllRanges();
  }

  function onCancelBookmark() {
    document.getSelection()?.removeAllRanges();
    setBookmarkSelection(undefined);
  }

  // Virtualizer
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: captions.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

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
          if (nextIndex !== prev && nextIndex !== undefined) {
            // Auto-scroll when entry changes
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
                  behavior: "auto",
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
  }, [player, captions, virtualizer]);

  // Click-to-seek
  function onClickEntry(index: number) {
    if (!player) return;
    // Don't seek if user is selecting text
    if (document.getSelection()?.toString()) return;

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
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (videoQuery.isError || !video) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-500">Failed to load video.</p>
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
                ? "bg-gray-200 font-medium"
                : "text-gray-500 hover:bg-gray-100",
            ].join(" ")}
            onClick={() => setActiveTab("captions")}
          >
            Captions
          </button>
          <button
            className={[
              "rounded px-2 py-0.5 text-sm",
              activeTab === "bookmarks"
                ? "bg-gray-200 font-medium"
                : "text-gray-500 hover:bg-gray-100",
            ].join(" ")}
            onClick={() => setActiveTab("bookmarks")}
          >
            Bookmarks
            {sortedBookmarks.length > 0 && ` (${sortedBookmarks.length})`}
          </button>
          {sortedBookmarks.length > 0 && (
            <div className="ml-auto flex gap-0.5">
              <button
                className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
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
                className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
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

        {/* Captions scroll area — hidden (not unmounted) to preserve virtualizer */}
        <div
          className="h-full flex-[1_0_0] overflow-y-auto"
          ref={scrollElementRef}
          style={{ display: activeTab === "captions" ? undefined : "none" }}
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
                  const hasBookmark = bookmarkedCaptionIds.has(entry.id);
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
                        "flex w-full flex-col gap-1 border p-1 px-2",
                        isEntryPlaying && "ring-2 ring-blue-300",
                        isCurrent ? "border-blue-500" : "border-gray-200",
                        item.index === 0 && "mt-1.5",
                        item.index === captions.length - 1 && "mb-1.5",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex items-center text-xs text-gray-400">
                        {hasBookmark && (
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                        )}
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
                          {highlightText(entry.text1, text1Marks ?? [])}
                        </div>
                        <div className="flex-1 pl-2" data-side="1">
                          {highlightText(entry.text2, text2Marks ?? [])}
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
                <p className="text-sm text-gray-400">No bookmarks yet</p>
              </div>
            ) : (
              <BookmarksList
                bookmarks={sortedBookmarks}
                captions={captions}
                player={player}
              />
            )}
          </div>
        )}

        {/* Floating bookmark action buttons */}
        {(bookmarkSelection || createBookmarkMutation.isPending) && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 shadow hover:bg-gray-300"
              onClick={onCancelBookmark}
              title="Cancel"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow hover:bg-blue-600"
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
