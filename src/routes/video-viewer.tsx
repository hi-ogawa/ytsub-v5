import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { useParams } from "react-router";
import { BookmarksList, CaptionList } from "../components/caption-list.tsx";
import type { BookmarkItem, CaptionRow } from "../lib/caption-types.ts";
import { extractBookmarkSelection } from "../lib/extension-bookmarks.ts";
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

// --- Components ---

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
  const bookmarkItems = (bookmarksQuery.data?.items ?? []) as Bookmark[];

  const sortedBookmarks = useMemo(
    () => [...bookmarkItems].sort((a, b) => a.timestamp - b.timestamp),
    [bookmarkItems],
  );

  // Map bookmarks by caption index (for CaptionList)
  const captionIndexById = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < captions.length; i++) map.set(captions[i].id, i);
    return map;
  }, [captions]);

  const bookmarksByIndex = useMemo(() => {
    const map = new Map<number, BookmarkItem[]>();
    for (const bm of bookmarkItems) {
      if (!bm.captionId) continue;
      const idx = captionIndexById.get(bm.captionId);
      if (idx === undefined) continue;
      const list = map.get(idx);
      if (list) list.push(bm);
      else map.set(idx, [bm]);
    }
    return map;
  }, [bookmarkItems, captionIndexById]);

  const { ref: playerRef, player } = useYouTubePlayer(video?.youtubeId);

  const [currentIndex, setCurrentIndex] = useState<number | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"captions" | "bookmarks">(
    "captions",
  );
  const [flashBookmarkId, setFlashBookmarkId] = useState<number | null>(null);
  const flashBookmarkCounter = useRef(0);
  const [flashCaptionIndex, setFlashCaptionIndex] = useState<number | null>(
    null,
  );
  const flashCaptionCounter = useRef(0);

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

  // Selection change listener
  const [bookmarkSelection, setBookmarkSelection] =
    useState<ReturnType<typeof extractBookmarkSelection>>();

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
    const entry = captions[bookmarkSelection.captionIndex];
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

  // Pause auto-scroll when bookmark popover is open
  const onPopoverOpenChange = useCallback((open: boolean) => {
    // CaptionList handles popover-open internally; this is kept for future use
    void open;
  }, []);

  // Caption list ref for cross-tab navigation
  const captionListRef = useRef<{ scrollToIndex: (index: number) => void }>(
    null,
  );

  function onGoToCaption(bm: BookmarkItem) {
    const bookmark = bm as Bookmark;
    if (!bookmark.captionId) return;
    const index = captionIndexById.get(bookmark.captionId);
    if (index === undefined) return;
    setActiveTab("captions");
    const counter = ++flashCaptionCounter.current;
    setFlashCaptionIndex(index);
    requestAnimationFrame(() => {
      captionListRef.current?.scrollToIndex(index);
    });
    setTimeout(() => {
      if (flashCaptionCounter.current === counter) setFlashCaptionIndex(null);
    }, 1000);
  }

  function onGoToBookmark(bookmarkId: string | number) {
    const counter = ++flashBookmarkCounter.current;
    setFlashBookmarkId(bookmarkId as number);
    setActiveTab("bookmarks");
    setTimeout(() => {
      if (flashBookmarkCounter.current === counter) setFlashBookmarkId(null);
    }, 1000);
  }

  // RAF loop — poll player time, update current entry
  useEffect(() => {
    if (!player || captions.length === 0) return;

    let rafId: number;
    const loop = () => {
      const playing = player.getPlayerState() === 1;
      setIsPlaying(playing);

      if (playing) {
        const time = player.getCurrentTime();
        const nextIndex = findCurrentEntry(captions, time);
        setCurrentIndex(nextIndex);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [player, captions]);

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

  const getCaptionForBookmark = useCallback(
    (bm: BookmarkItem): CaptionRow | undefined => {
      const bookmark = bm as Bookmark;
      if (!bookmark.captionId) return undefined;
      const idx = captionIndexById.get(bookmark.captionId);
      return idx !== undefined ? captions[idx] : undefined;
    },
    [captions, captionIndexById],
  );

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
              <ArrowDown className="h-4 w-4" />
            </button>
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

        {/* Captions — hidden (not unmounted) to preserve virtualizer */}
        <div
          className="flex min-h-0 flex-[1_0_0] flex-col"
          style={{ display: activeTab === "captions" ? undefined : "none" }}
        >
          <CaptionList
            ref={captionListRef}
            rows={captions}
            currentIndex={currentIndex}
            isPlaying={isPlaying}
            player={player}
            autoScroll={autoScroll}
            bookmarksByIndex={bookmarksByIndex}
            onGoToBookmark={onGoToBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
            flashIndex={flashCaptionIndex}
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
              <BookmarksList
                bookmarks={sortedBookmarks}
                player={player}
                onDeleteBookmark={(id) =>
                  deleteMutation.mutate({ id: id as number })
                }
                onGoToCaption={onGoToCaption}
                flashBookmarkId={flashBookmarkId}
                getCaptionForBookmark={getCaptionForBookmark}
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
              <X className="h-5 w-5" />
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow hover:bg-accent/90"
              onClick={onClickBookmark}
              disabled={createBookmarkMutation.isPending}
              title="Create bookmark"
            >
              {createBookmarkMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <BookmarkIcon className="h-5 w-5 fill-current" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
