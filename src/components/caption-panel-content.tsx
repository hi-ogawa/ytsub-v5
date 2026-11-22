import { Bookmark, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import type { CaptionSessionManager } from "../lib/caption-session.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import {
  type BookmarksListHandle,
  ExtensionBookmarksList,
} from "./bookmarks-list.tsx";
import { CaptionList, type CaptionListHandle } from "./caption-list.tsx";
import { useBookmarkSelection } from "./use-bookmark-selection.ts";
import type { YTPlayer } from "./youtube-player.tsx";

export function CaptionPanelContent({
  store,
  player,
  autoScroll,
}: {
  store: CaptionSessionManager;
  player?: YTPlayer;
  autoScroll: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("captions");
  const contentRef = useRef<HTMLDivElement>(null);
  const captionListRef = useRef<CaptionViewerHandle>(null);
  const bookmarksListRef = useRef<BookmarksListHandle>(null);

  // Both tabs list and number bookmarks in playback order.
  const sortedBookmarks = useMemo(
    () =>
      [...store.bookmarks].sort(
        (a, b) => a.timestamp - b.timestamp || a.offset - b.offset,
      ),
    [store.bookmarks],
  );

  // Previous and next wrap around. Previous skips a bookmark within the last
  // second, so pressing it right after a jump moves on instead of repeating.
  function onPrevBookmark() {
    if (!player || sortedBookmarks.length === 0) {
      return;
    }
    const time = player.getCurrentTime();
    const prev = sortedBookmarks.findLast((bm) => bm.timestamp < time - 1);
    goToBookmarkCaption(prev ?? sortedBookmarks[sortedBookmarks.length - 1]);
  }

  function onNextBookmark() {
    if (!player || sortedBookmarks.length === 0) {
      return;
    }
    const time = player.getCurrentTime();
    const next = sortedBookmarks.find((bm) => bm.timestamp > time + 0.5);
    goToBookmarkCaption(next ?? sortedBookmarks[0]);
  }

  function goToBookmarkCaption(bookmark: ExtensionBookmark) {
    player?.seekTo(bookmark.timestamp);
    // The playback loop only follows the player while it plays, so a paused
    // seek would otherwise leave the list on the old caption.
    captionListRef.current?.showCaption(bookmark.captionIndex);
  }

  // Switching tabs first un-hides the target list, so the scroll waits a tick
  // until it has a layout.
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

  const bookmarkSelection = useBookmarkSelection(contentRef, store);

  return (
    <div ref={contentRef} className="flex min-h-0 flex-[1_0_0] flex-col">
      <TabBar
        activeTab={activeTab}
        bookmarkCount={sortedBookmarks.length}
        onSelectTab={setActiveTab}
        onPrevBookmark={onPrevBookmark}
        onNextBookmark={onNextBookmark}
      />

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
            bookmarks={sortedBookmarks}
            onGoToBookmark={onGoToBookmark}
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

        {bookmarkSelection.selection && (
          <BookmarkActions
            onCancel={bookmarkSelection.cancel}
            onCreate={bookmarkSelection.create}
          />
        )}
      </div>
    </div>
  );
}

type Tab = "captions" | "bookmarks";

function TabBar({
  activeTab,
  bookmarkCount,
  onSelectTab,
  onPrevBookmark,
  onNextBookmark,
}: {
  activeTab: Tab;
  bookmarkCount: number;
  onSelectTab: (tab: Tab) => void;
  onPrevBookmark: () => void;
  onNextBookmark: () => void;
}) {
  return (
    <div className="flex flex-none items-center gap-1 border-b px-2 py-0.5 lg:py-1">
      <div role="tablist" className="flex gap-1">
        <button
          role="tab"
          aria-selected={activeTab === "captions"}
          className={[
            "rounded px-2 py-0.5 text-sm",
            activeTab === "captions"
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted",
          ].join(" ")}
          onClick={() => onSelectTab("captions")}
        >
          Captions
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "bookmarks"}
          className={[
            "rounded px-2 py-0.5 text-sm",
            activeTab === "bookmarks"
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted",
          ].join(" ")}
          onClick={() => onSelectTab("bookmarks")}
        >
          Bookmarks
          {bookmarkCount > 0 && ` (${bookmarkCount})`}
        </button>
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <div className="flex gap-0.5">
          <button
            className={`rounded p-0.5 text-muted-foreground ${bookmarkCount > 0 ? "hover:bg-muted" : "opacity-30"}`}
            onClick={onPrevBookmark}
            disabled={bookmarkCount === 0}
            title="Previous bookmark"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            className={`rounded p-0.5 text-muted-foreground ${bookmarkCount > 0 ? "hover:bg-muted" : "opacity-30"}`}
            onClick={onNextBookmark}
            disabled={bookmarkCount === 0}
            title="Next bookmark"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BookmarkActions({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="absolute bottom-2 right-2 flex gap-2">
      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shadow hover:bg-muted/80"
        onClick={onCancel}
        title="Cancel"
      >
        <X className="size-5" />
      </button>
      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow hover:bg-accent/90"
        onClick={onCreate}
        title="Create bookmark"
      >
        <Bookmark className="size-5 fill-current" />
      </button>
    </div>
  );
}

type CaptionViewerHandle = CaptionListHandle & {
  showCaption: (index: number) => void;
};

function CaptionViewer({
  ref,
  rows,
  player,
  autoScroll,
  bookmarks,
  onGoToBookmark,
}: {
  ref: React.Ref<CaptionViewerHandle>;
  rows: MergedCaption[];
  player?: YTPlayer;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onGoToBookmark: (bookmarkId: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const listRef = useRef<CaptionListHandle>(null);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index) => listRef.current?.scrollToIndex(index),
    showCaption: (index) => {
      setCurrentIndex(index);
      listRef.current?.scrollToIndex(index);
    },
  }));

  useEffect(() => {
    if (!player || rows.length === 0) {
      return;
    }
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
      ref={listRef}
      rows={rows}
      currentIndex={currentIndex}
      isPlaying={isPlaying}
      player={player}
      autoScroll={autoScroll}
      bookmarks={bookmarks}
      onGoToBookmark={onGoToBookmark}
    />
  );
}
