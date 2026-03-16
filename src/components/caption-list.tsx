import { ExternalLink } from "lucide-react";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
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
  bookmark: ExtensionBookmark;
  offset: number;
  children: React.ReactNode;
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const filled = !!bookmark.translation;
  const triggerRef = useRef<HTMLSpanElement>(null);
  return (
    <Popover onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <span
          ref={triggerRef}
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
        onPointerDownOutside={(e) => {
          // When modal=false (extension shadow DOM), DismissableLayer closes
          // on pointerdown before the trigger's click can toggle. Prevent the
          // dismiss when clicking the trigger so the toggle handles it.
          if (
            triggerRef.current?.contains(e.detail.originalEvent.target as Node)
          ) {
            e.preventDefault();
          }
        }}
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
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function highlightText(
  text: string,
  marks: { offset: number; length: number; bookmark?: ExtensionBookmark }[],
  onGoToBookmark: (bookmarkId: string) => void,
  onPopoverOpenChange: (open: boolean) => void,
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
          key={m.bookmark.id}
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

export type CaptionListHandle = {
  scrollToIndex: (index: number) => void;
};

export function CaptionList({
  ref,
  rows,
  currentIndex,
  isPlaying,
  player,
  autoScroll,
  bookmarks,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  ref: React.Ref<CaptionListHandle>;
  rows: MergedCaption[];
  currentIndex?: number;
  isPlaying: boolean;
  player?: YTPlayer;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const bookmarksByIndex = useMemo(() => {
    const map = new Map<number, ExtensionBookmark[]>();
    for (const bm of bookmarks) {
      const list = map.get(bm.captionIndex);
      if (list) list.push(bm);
      else map.set(bm.captionIndex, [bm]);
    }
    return map;
  }, [bookmarks]);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      const el = scrollRef.current?.querySelector(
        `[data-index="${index}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash-highlight");
        void el.offsetWidth; // Force reflow to restart animation
        el.classList.add("flash-highlight");
      }
      onManualScroll();
    },
  }));
  const prevScrollIndex = useRef<number | undefined>(undefined);
  const isManualScrollRef = useRef(false);
  const isPopoverOpenRef = useRef(false);
  const manualScrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const wrappedPopoverOpenChange = (open: boolean) => {
    isPopoverOpenRef.current = open;
    onPopoverOpenChange(open);
  };

  function onManualScroll() {
    isManualScrollRef.current = true;
    if (manualScrollTimer.current) {
      clearTimeout(manualScrollTimer.current);
    }
    manualScrollTimer.current = setTimeout(() => {
      isManualScrollRef.current = false;
      manualScrollTimer.current = undefined;
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

    const el = scrollEl.querySelector(`[data-index="${currentIndex}"]`);
    if (!el) return;

    // Only scroll if item is far from viewport center
    const { scrollTop, clientHeight } = scrollEl;
    const currentCenter = scrollTop + clientHeight / 2;
    const itemRect =
      (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight / 2;
    const threshold = clientHeight / 6;

    if (Math.abs(itemRect - currentCenter) > threshold) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

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

  return (
    <div
      className="flex-[1_0_0] overflow-y-auto"
      ref={scrollRef}
      onWheel={onManualScroll}
      onTouchStart={onManualScroll}
    >
      <div className="flex flex-col gap-1.5 p-1.5">
        {rows.map((row, i) => {
          const rowBookmarks = bookmarksByIndex?.get(i);
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
              key={i}
              data-index={i}
              className={[
                "flex w-full cursor-pointer flex-col gap-1 border p-1 px-2 hover:bg-muted",
                i === currentIndex && isPlaying && "ring-2 ring-ring",
                i === currentIndex ? "border-ring" : "border-border",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onClickRow(i)}
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
  );
}
