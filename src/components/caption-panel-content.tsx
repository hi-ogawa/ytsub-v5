import { Bookmark, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import {
  type CaptionPanelRuntime,
  type CaptionSession,
  sortBookmarks,
} from "../lib/caption-panel-runtime.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import {
  type BookmarksListHandle,
  ExtensionBookmarksList,
} from "./bookmarks-list.tsx";
import { CaptionList, type CaptionListHandle } from "./caption-list.tsx";
import { useBookmarkSelection } from "./use-bookmark-selection.ts";

export function CaptionPanelContent({
  runtime,
  session,
  autoScroll,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
  autoScroll: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("captions");
  const contentRef = useRef<HTMLDivElement>(null);
  const captionListRef = useRef<CaptionListHandle>(null);
  const bookmarksListRef = useRef<BookmarksListHandle>(null);

  const { currentIndex, isPlaying, repeatIndex } = useSyncExternalStore(
    runtime.playbackStore.subscribe,
    runtime.playbackStore.get,
  );

  const sortedBookmarks = useMemo(
    () => sortBookmarks(session.bookmarks),
    [session.bookmarks],
  );

  function scrollToBookmarkCaption(bookmark?: ExtensionBookmark) {
    if (bookmark) {
      captionListRef.current?.scrollToIndex(bookmark.captionIndex);
    }
  }

  // Switching tabs first un-hides the target list, so the scroll waits a tick
  // until it has a layout.
  const onGoToCaption = useCallback((captionIndex: number) => {
    setActiveTab("captions");
    setTimeout(() => {
      captionListRef.current?.scrollToIndex(captionIndex);
    });
  }, []);

  const onGoToBookmark = useCallback((bookmarkId: string) => {
    setActiveTab("bookmarks");
    setTimeout(() => {
      bookmarksListRef.current?.scrollToBookmark(bookmarkId);
    });
  }, []);

  // The rows and cards are memoized, so their callbacks stay stable.
  const onPlayOrToggleRow = useCallback(
    (index: number) => runtime.playOrToggleRow(index),
    [runtime],
  );
  const onClickBookmark = useCallback(
    (bookmark: ExtensionBookmark) =>
      runtime.playOrToggleRow(bookmark.captionIndex),
    [runtime],
  );
  const onToggleRepeat = useCallback(
    (index: number) => runtime.toggleRepeat(index),
    [runtime],
  );
  const onDeleteBookmark = useCallback(
    (id: string) => runtime.deleteBookmark(id),
    [runtime],
  );

  const bookmarkSelection = useBookmarkSelection({
    contentRef,
    runtime,
    rows: session.rows,
  });

  return (
    <div ref={contentRef} className="flex min-h-0 flex-[1_0_0] flex-col">
      <TabBar
        activeTab={activeTab}
        bookmarkCount={sortedBookmarks.length}
        onSelectTab={setActiveTab}
        onPrevBookmark={() =>
          scrollToBookmarkCaption(runtime.seekToPreviousBookmark())
        }
        onNextBookmark={() =>
          scrollToBookmarkCaption(runtime.seekToNextBookmark())
        }
      />

      <div className="relative flex min-h-0 flex-[1_0_0] flex-col">
        {/* The tabs stack with the active one on top. The inactive one skips
            rendering but keeps its layout and scroll position, so showing it
            again doesn't lay out every row from scratch. */}
        <div
          className="absolute inset-0 flex flex-col"
          style={
            activeTab === "captions"
              ? { zIndex: 1 }
              : { contentVisibility: "hidden" }
          }
        >
          <CaptionViewer
            ref={captionListRef}
            runtime={runtime}
            rows={session.rows}
            autoScroll={autoScroll}
            bookmarks={sortedBookmarks}
            onPlayOrToggleRow={onPlayOrToggleRow}
            onToggleRepeat={onToggleRepeat}
            onGoToBookmark={onGoToBookmark}
            onDeleteBookmark={onDeleteBookmark}
          />
        </div>

        <div
          className="absolute inset-0 overflow-y-auto"
          style={
            activeTab === "bookmarks"
              ? { zIndex: 1 }
              : { contentVisibility: "hidden" }
          }
        >
          {sortedBookmarks.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No bookmarks yet</p>
            </div>
          ) : (
            <ExtensionBookmarksList
              ref={bookmarksListRef}
              bookmarks={sortedBookmarks}
              rows={session.rows}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              repeatIndex={repeatIndex}
              onClickBookmark={onClickBookmark}
              onToggleRepeat={onToggleRepeat}
              onDeleteBookmark={onDeleteBookmark}
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
    <div className="absolute bottom-2 right-2 z-10 flex gap-2">
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

function CaptionViewer({
  ref,
  runtime,
  rows,
  autoScroll,
  bookmarks,
  onPlayOrToggleRow,
  onToggleRepeat,
  onGoToBookmark,
  onDeleteBookmark,
}: {
  ref: React.Ref<CaptionListHandle>;
  runtime: CaptionPanelRuntime;
  rows: MergedCaption[];
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onPlayOrToggleRow: (index: number) => void;
  onToggleRepeat: (index: number) => void;
  onGoToBookmark: (bookmarkId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
}) {
  const { currentIndex, isPlaying, repeatIndex } = useSyncExternalStore(
    runtime.playbackStore.subscribe,
    runtime.playbackStore.get,
  );

  return (
    <CaptionList
      ref={ref}
      rows={rows}
      currentIndex={currentIndex}
      isPlaying={isPlaying}
      repeatIndex={repeatIndex}
      autoScroll={autoScroll}
      bookmarks={bookmarks}
      onPlayOrToggleRow={onPlayOrToggleRow}
      onToggleRepeat={onToggleRepeat}
      onGoToBookmark={onGoToBookmark}
      onDeleteBookmark={onDeleteBookmark}
    />
  );
}
