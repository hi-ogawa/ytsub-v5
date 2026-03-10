import { useVirtualizer } from "@tanstack/react-virtual";
import { EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { BookmarkItem, CaptionRow } from "../lib/caption-types.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function BookmarkWord({
  bookmark,
  offset,
  children,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  bookmark: BookmarkItem;
  offset: number;
  children: React.ReactNode;
  onGoToBookmark?: (bookmarkId: string | number) => void;
  onPopoverOpenChange?: (open: boolean) => void;
}) {
  const filled = !!bookmark.translation;
  return (
    <Popover onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <span
          className="inline-block cursor-pointer"
          data-testid="bookmark-highlight"
          data-offset={offset}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={
              filled
                ? "border-b-2 border-highlight-alt-border bg-highlight-alt-bg"
                : "border-b-2 border-highlight-border bg-highlight-bg"
            }
          >
            {children}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        data-testid="bookmark-popover"
        side="top"
        avoidCollisions
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <span className="block text-xs font-medium text-popover-foreground">
          {bookmark.text}
        </span>
        {bookmark.translation ? (
          <span className="block text-xs text-muted-foreground">
            {bookmark.translation}
          </span>
        ) : (
          <span className="block text-xs italic text-muted-foreground/50">
            unfilled
          </span>
        )}
        {bookmark.etymology && (
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {bookmark.etymology}
          </span>
        )}
        {onGoToBookmark && (
          <button
            className="mt-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Go to bookmark"
            onMouseDown={(e) => {
              e.stopPropagation();
              onGoToBookmark(bookmark.id);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function highlightText(
  text: string,
  marks: { offset: number; length: number; bookmark?: BookmarkItem }[],
  onGoToBookmark?: (bookmarkId: string | number) => void,
  onPopoverOpenChange?: (open: boolean) => void,
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
    if (m.bookmark) {
      parts.push(
        <BookmarkWord
          key={`${m.bookmark.id}`}
          bookmark={m.bookmark}
          offset={m.offset}
          onGoToBookmark={onGoToBookmark}
          onPopoverOpenChange={onPopoverOpenChange}
        >
          {text.slice(m.offset, end)}
        </BookmarkWord>,
      );
    } else {
      parts.push(
        <span
          key={`h${m.offset}`}
          data-offset={m.offset}
          className="border-b-2 border-highlight-border bg-highlight-bg"
        >
          {text.slice(m.offset, end)}
        </span>,
      );
    }
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

export function CaptionList({
  ref,
  rows,
  currentIndex,
  isPlaying,
  player,
  autoScroll = true,
  bookmarksByIndex,
  onGoToBookmark,
  onPopoverOpenChange,
  flashIndex,
}: {
  ref?: React.Ref<{ scrollToIndex: (index: number) => void }>;
  rows: CaptionRow[];
  currentIndex: number | undefined;
  isPlaying: boolean;
  player: YTPlayer | null;
  autoScroll?: boolean;
  bookmarksByIndex?: Map<number, BookmarkItem[]>;
  onGoToBookmark?: (bookmarkId: string | number) => void;
  onPopoverOpenChange?: (open: boolean) => void;
  flashIndex?: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      virtualizer.scrollToIndex(index, {
        align: "center",
        behavior: "smooth",
      });
    },
  }));

  const prevScrollIndex = useRef<number | undefined>(undefined);
  const isManualScrollRef = useRef(false);
  const isPopoverOpenRef = useRef(false);
  const manualScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wrappedPopoverOpenChange = onPopoverOpenChange
    ? (open: boolean) => {
        isPopoverOpenRef.current = open;
        onPopoverOpenChange(open);
      }
    : undefined;

  function onManualScroll() {
    isManualScrollRef.current = true;
    if (manualScrollTimer.current !== null) {
      clearTimeout(manualScrollTimer.current);
    }
    manualScrollTimer.current = setTimeout(() => {
      isManualScrollRef.current = false;
      manualScrollTimer.current = null;
    }, 2000);
  }

  // Auto-scroll with threshold + manual scroll pause
  useEffect(() => {
    if (currentIndex === undefined || currentIndex === prevScrollIndex.current)
      return;
    prevScrollIndex.current = currentIndex;

    if (!autoScroll || isManualScrollRef.current || isPopoverOpenRef.current)
      return;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const { scrollTop, clientHeight } = scrollEl;
    const currentCenter = scrollTop + clientHeight / 2;
    const threshold = clientHeight / 6;
    const items = virtualizer.getVirtualItems();
    const item = items.find((it) => it.index === currentIndex);
    if (!item || Math.abs(item.start - currentCenter) > threshold) {
      virtualizer.scrollToIndex(currentIndex, {
        align: "center",
        behavior: "smooth",
      });
    }
  }, [currentIndex, autoScroll, virtualizer]);

  function onClickRow(index: number) {
    if (!player) return;
    const root = scrollRef.current?.getRootNode();
    const sel =
      root && "getSelection" in root
        ? (
            root as unknown as { getSelection(): Selection | null }
          ).getSelection()
        : document.getSelection();
    if (sel?.toString()) return;
    isManualScrollRef.current = false;
    if (index === currentIndex) {
      isPlaying ? player.pauseVideo() : player.playVideo();
    } else {
      player.seekTo(rows[index].begin);
      player.playVideo();
    }
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="flex-[1_0_0] overflow-y-auto"
      ref={scrollRef}
      onWheel={onManualScroll}
      onTouchStart={onManualScroll}
    >
      {rows.length > 0 && virtualItems.length > 0 && (
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
              const row = rows[item.index];
              const rowBookmarks = bookmarksByIndex?.get(item.index);
              const text1Marks = rowBookmarks
                ?.filter((b) => b.side === 0)
                .map((b) => ({
                  offset: b.offset,
                  length: b.text.length,
                  bookmark: b,
                }));
              const text2Marks = rowBookmarks
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
                    "flex w-full cursor-pointer flex-col gap-1 border p-1 px-2 hover:bg-muted",
                    item.index === currentIndex &&
                      isPlaying &&
                      "ring-2 ring-ring",
                    item.index === currentIndex
                      ? "border-ring"
                      : "border-border",
                    item.index === flashIndex && "flash-highlight",
                    item.index === 0 && "mt-1.5",
                    item.index === rows.length - 1 && "mb-1.5",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onClickRow(item.index)}
                >
                  <div className="text-xs text-muted-foreground">
                    <span className="ml-auto">
                      {formatTimestamp(row.begin)} – {formatTimestamp(row.end)}
                    </span>
                  </div>
                  <div className="flex text-sm">
                    <div className="flex-1 border-r pr-2" data-side="0">
                      {highlightText(
                        row.text1,
                        text1Marks ?? [],
                        onGoToBookmark,
                        wrappedPopoverOpenChange,
                      )}
                    </div>
                    <div className="flex-1 pl-2" data-side="1">
                      {highlightText(
                        row.text2,
                        text2Marks ?? [],
                        onGoToBookmark,
                        wrappedPopoverOpenChange,
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
  );
}

// --- BookmarksList ---

export function BookmarksList({
  bookmarks,
  player,
  onDeleteBookmark,
  onGoToCaption,
  flashBookmarkId,
  getCaptionForBookmark,
}: {
  bookmarks: BookmarkItem[];
  player: YTPlayer | null;
  onDeleteBookmark: (id: string | number) => void;
  onGoToCaption?: (bm: BookmarkItem) => void;
  flashBookmarkId: string | number | null;
  getCaptionForBookmark: (bm: BookmarkItem) => CaptionRow | undefined;
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
        const caption = getCaptionForBookmark(bm);
        return (
          <div
            key={`${bm.id}`}
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
                  {onGoToCaption && (
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Go to caption"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoToCaption(bm);
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
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
