import { ExternalLink } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import {
  type ExtensionBookmark,
  indexBookmarks,
} from "../lib/extension-bookmarks.ts";
import { flashHighlight } from "../lib/flash-highlight.ts";
import { getSelectionAt } from "../utils/get-selection.ts";
import { RepeatToggle } from "./repeat-toggle.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { useTimedFlag } from "./use-timed-flag.ts";

export type CaptionListHandle = {
  scrollToIndex: (index: number) => void;
};

export function CaptionList({
  ref,
  rows,
  currentIndex,
  isPlaying,
  repeatIndex,
  autoScroll,
  bookmarks,
  onPlayOrToggleRow,
  onToggleRepeat,
  onGoToBookmark,
}: {
  ref: React.Ref<CaptionListHandle>;
  rows: MergedCaption[];
  currentIndex?: number;
  isPlaying: boolean;
  repeatIndex?: number;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onPlayOrToggleRow: (index: number) => void;
  onToggleRepeat: (index: number) => void;
  onGoToBookmark: (bookmarkId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { bookmarksByIndex, bookmarkNumberById } = useMemo(
    () => indexBookmarks(bookmarks),
    [bookmarks],
  );

  // Auto-scroll pauses for 2 seconds after the user scrolls or jumps to a
  // row, and while a bookmark popover is open.
  const manualScroll = useTimedFlag(2000);
  const isPopoverOpenRef = useRef(false);

  function onPopoverOpenChange(open: boolean) {
    isPopoverOpenRef.current = open;
  }

  // A jump to a row, such as from the bookmarks tab, counts as a manual
  // scroll, so auto-scroll doesn't pull the list away from it right after.
  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      const el = scrollRef.current?.querySelector(
        `[data-index="${index}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(el);
      }
      manualScroll.trigger();
    },
  }));

  // Follows the current caption, scrolling only when it drifts more than a
  // sixth of the viewport from the center.
  const previousScrollIndex = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      currentIndex === undefined ||
      currentIndex === previousScrollIndex.current
    ) {
      return;
    }
    previousScrollIndex.current = currentIndex;

    if (!autoScroll || manualScroll.isActive() || isPopoverOpenRef.current) {
      return;
    }

    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    const el = scrollEl.querySelector(`[data-index="${currentIndex}"]`);
    if (!el) {
      return;
    }

    const { scrollTop, clientHeight } = scrollEl;
    const currentCenter = scrollTop + clientHeight / 2;
    const itemRect =
      (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight / 2;
    const threshold = clientHeight / 6;

    if (Math.abs(itemRect - currentCenter) > threshold) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  // A click that ends a text selection is for bookmarking, not playback.
  // Any other click resumes auto-scroll.
  function onClickRow(index: number) {
    if (getSelectionAt(scrollRef.current)?.toString()) {
      return;
    }
    manualScroll.clear();
    onPlayOrToggleRow(index);
  }

  return (
    <div
      data-testid="caption-list"
      className="flex-[1_0_0] overflow-y-auto"
      ref={scrollRef}
      onWheel={manualScroll.trigger}
      onTouchStart={manualScroll.trigger}
    >
      <div className="flex flex-col gap-1.5 p-1.5">
        {rows.map((row, i) => (
          <CaptionRow
            key={i}
            row={row}
            index={i}
            isCurrent={i === currentIndex}
            isPlaying={isPlaying}
            isRepeating={i === repeatIndex}
            bookmarks={bookmarksByIndex.get(i)}
            bookmarkNumberById={bookmarkNumberById}
            onClick={() => onClickRow(i)}
            onToggleRepeat={() => {
              manualScroll.clear();
              onToggleRepeat(i);
            }}
            onGoToBookmark={onGoToBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        ))}
      </div>
    </div>
  );
}

function CaptionRow({
  row,
  index,
  isCurrent,
  isPlaying,
  isRepeating,
  bookmarks,
  bookmarkNumberById,
  onClick,
  onToggleRepeat,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  row: MergedCaption;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isRepeating: boolean;
  bookmarks?: ExtensionBookmark[];
  bookmarkNumberById: Map<string, number>;
  onClick: () => void;
  onToggleRepeat: () => void;
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const text1Marks = bookmarks
    ?.filter((b) => b.side === 0)
    .map((b) => ({
      bookmark: b,
      bookmarkNumber: bookmarkNumberById.get(b.id),
    }));
  const text2Marks = bookmarks
    ?.filter((b) => b.side === 1)
    .map((b) => ({
      bookmark: b,
      bookmarkNumber: bookmarkNumberById.get(b.id),
    }));

  return (
    <div
      data-index={index}
      aria-current={isCurrent || undefined}
      className={[
        "flex w-full cursor-pointer flex-col gap-1 border p-1 px-2 hover:bg-muted",
        isCurrent && isPlaying && "ring-2 ring-ring",
        isCurrent ? "border-ring" : "border-border",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <div className="flex items-center text-xs text-muted-foreground">
        <span>
          {formatTimestamp(row.begin)} – {formatTimestamp(row.end)}
        </span>
        <RepeatToggle
          className="-my-0.5 ml-auto"
          isRepeating={isRepeating}
          onToggle={onToggleRepeat}
        />
      </div>
      <div className="flex text-sm">
        <div className="flex-1 border-r pr-2" data-side="0">
          <HighlightedText
            text={row.text1}
            marks={text1Marks ?? []}
            onGoToBookmark={onGoToBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        </div>
        <div className="flex-1 pl-2" data-side="1">
          <HighlightedText
            text={row.text2}
            marks={text2Marks ?? []}
            onGoToBookmark={onGoToBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        </div>
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  marks,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  text: string;
  marks: { bookmark: ExtensionBookmark; bookmarkNumber?: number }[];
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  if (marks.length === 0) {
    return <span data-offset={0}>{text}</span>;
  }
  const sorted = [...marks].sort(
    (a, b) => a.bookmark.offset - b.bookmark.offset,
  );
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const { bookmark, bookmarkNumber } of sorted) {
    if (bookmark.offset > cursor) {
      parts.push(
        <span key={`t${cursor}`} data-offset={cursor}>
          {text.slice(cursor, bookmark.offset)}
        </span>,
      );
    }
    const end = bookmark.offset + bookmark.text.length;
    parts.push(
      <BookmarkWord
        key={bookmark.id}
        bookmark={bookmark}
        bookmarkNumber={bookmarkNumber}
        offset={bookmark.offset}
        onGoToBookmark={onGoToBookmark}
        onPopoverOpenChange={onPopoverOpenChange}
      >
        {text.slice(bookmark.offset, end)}
      </BookmarkWord>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(
      <span key={`t${cursor}`} data-offset={cursor}>
        {text.slice(cursor)}
      </span>,
    );
  }
  return <>{parts}</>;
}

function BookmarkWord({
  bookmark,
  bookmarkNumber,
  offset,
  children,
  onGoToBookmark,
  onPopoverOpenChange,
}: {
  bookmark: ExtensionBookmark;
  bookmarkNumber?: number;
  offset: number;
  children: React.ReactNode;
  onGoToBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const filled = !!bookmark.translation;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  function changeOpen(next: boolean) {
    setOpen(next);
    onPopoverOpenChange(next);
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
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
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          // When modal=false (extension shadow DOM), DismissableLayer closes
          // on pointerdown before the trigger's click can toggle. Prevent the
          // dismiss when clicking the trigger so the toggle handles it.
          // Use composedPath() because shadow DOM retargets event.target to
          // the host element.
          const target = e.detail.originalEvent.composedPath()[0] as Node;
          if (triggerRef.current?.contains(target)) {
            e.preventDefault();
          }
        }}
      >
        <span className="block text-xs font-medium text-popover-foreground">
          {bookmarkNumber !== undefined && (
            <span className="mr-1 text-muted-foreground">
              #{bookmarkNumber}
            </span>
          )}
          {bookmark.text}
        </span>
        {bookmark.translation ? (
          <span className="block text-xs text-popover-foreground">
            {bookmark.translation}
          </span>
        ) : (
          <span className="block text-xs italic text-muted-foreground">
            unfilled
          </span>
        )}
        {bookmark.etymology && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {bookmark.etymology}
          </span>
        )}
        {bookmark.notes && (
          <span className="mt-1 block max-h-24 overflow-y-auto text-xs text-muted-foreground">
            {bookmark.notes}
          </span>
        )}
        {onGoToBookmark && (
          <button
            className="mt-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Go to bookmark"
            onMouseDown={(e) => {
              e.stopPropagation();
              // The Captions tab gets hidden rather than unmounted, so an open
              // popover would stay on screen, anchored to a zero-size trigger.
              changeOpen(false);
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

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
