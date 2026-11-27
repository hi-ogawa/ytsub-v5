import { Bookmark, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import {
  type CaptionPanelRuntime,
  type CaptionSession,
  sortBookmarks,
} from "../lib/caption-panel-runtime.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import { getLangCodeFromVssId } from "../lib/youtube.ts";
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
  const languages: [string, string] = [
    getLangCodeFromVssId(session.vssId1),
    getLangCodeFromVssId(session.vssId2),
  ];

  function scrollToBookmarkCaption(bookmark?: ExtensionBookmark) {
    if (bookmark) {
      captionListRef.current?.scrollToIndex(bookmark.captionIndex);
    }
  }

  // Switching tabs first un-hides the target list, so the scroll waits a tick
  // until it has a layout. It jumps, because a smooth scroll in a list that was
  // hidden only animates from where it was left.
  function onGoToCaption(captionIndex: number) {
    setActiveTab("captions");
    setTimeout(() => {
      captionListRef.current?.scrollToIndex(captionIndex, {
        behavior: "instant",
      });
    });
  }

  function onGoToBookmark(bookmarkId: string) {
    setActiveTab("bookmarks");
    setTimeout(() => {
      bookmarksListRef.current?.scrollToBookmark(bookmarkId, {
        behavior: "instant",
      });
    });
  }

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
            languages={languages}
            autoScroll={autoScroll}
            bookmarks={sortedBookmarks}
            onGoToBookmark={onGoToBookmark}
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
              languages={languages}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              repeatIndex={repeatIndex}
              onClickBookmark={(bookmark) =>
                runtime.playOrToggleRow(bookmark.captionIndex)
              }
              onToggleRepeat={(captionIndex) =>
                runtime.toggleRepeat(captionIndex)
              }
              onDeleteBookmark={(id) => runtime.deleteBookmark(id)}
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
  languages,
  autoScroll,
  bookmarks,
  onGoToBookmark,
}: {
  ref: React.Ref<CaptionListHandle>;
  runtime: CaptionPanelRuntime;
  rows: MergedCaption[];
  languages: [string, string];
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onGoToBookmark: (bookmarkId: string) => void;
}) {
  const { currentIndex, isPlaying, repeatIndex } = useSyncExternalStore(
    runtime.playbackStore.subscribe,
    runtime.playbackStore.get,
  );

  return (
    <CaptionList
      ref={ref}
      rows={rows}
      languages={languages}
      currentIndex={currentIndex}
      isPlaying={isPlaying}
      repeatIndex={repeatIndex}
      autoScroll={autoScroll}
      bookmarks={bookmarks}
      onPlayOrToggleRow={(index) => runtime.playOrToggleRow(index)}
      onToggleRepeat={(index) => runtime.toggleRepeat(index)}
      onGoToBookmark={onGoToBookmark}
      onDeleteBookmark={(id) => runtime.deleteBookmark(id)}
    />
  );
}
