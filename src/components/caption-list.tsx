import { ExternalLink, Trash2 } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import { captionPanelPreferences } from "../lib/caption-panel-preferences.ts";
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
  languages,
  currentIndex,
  isPlaying,
  repeatIndex,
  autoScroll,
  bookmarks,
  onPlayOrToggleRow,
  onToggleRepeat,
  onGoToBookmark,
  onDeleteBookmark,
}: {
  ref: React.Ref<CaptionListHandle>;
  rows: MergedCaption[];
  /** Language codes of the two caption tracks, indexed by side */
  languages: [string, string];
  currentIndex?: number;
  isPlaying: boolean;
  repeatIndex?: number;
  autoScroll: boolean;
  bookmarks: ExtensionBookmark[];
  onPlayOrToggleRow: (index: number) => void;
  onToggleRepeat: (index: number) => void;
  onGoToBookmark: (bookmarkId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
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
      const element = scrollRef.current?.querySelector(
        `[data-index="${index}"]`,
      ) as HTMLElement | null;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(element);
      }
      manualScroll.trigger();
    },
  }));

  // Follows the current caption, scrolling only when it drifts more than a
  // sixth of the viewport from the center.
  const prevScrollIndex = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      currentIndex === undefined ||
      currentIndex === prevScrollIndex.current
    ) {
      return;
    }
    prevScrollIndex.current = currentIndex;

    if (!autoScroll || manualScroll.isActive() || isPopoverOpenRef.current) {
      return;
    }

    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const element = scrollElement.querySelector(
      `[data-index="${currentIndex}"]`,
    );
    if (!element) {
      return;
    }

    const { scrollTop, clientHeight } = scrollElement;
    const currentCenter = scrollTop + clientHeight / 2;
    const itemCenter =
      (element as HTMLElement).offsetTop +
      (element as HTMLElement).offsetHeight / 2;
    const threshold = clientHeight / 6;

    if (Math.abs(itemCenter - currentCenter) > threshold) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
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

  function onToggleRowRepeat(index: number) {
    manualScroll.clear();
    onToggleRepeat(index);
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
            languages={languages}
            index={i}
            isCurrent={i === currentIndex}
            isPlaying={i === currentIndex && isPlaying}
            isRepeating={i === repeatIndex}
            bookmarks={bookmarksByIndex.get(i)}
            bookmarkNumberById={bookmarkNumberById}
            onClick={onClickRow}
            onToggleRepeat={onToggleRowRepeat}
            onGoToBookmark={onGoToBookmark}
            onDeleteBookmark={onDeleteBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        ))}
      </div>
    </div>
  );
}

// The rows share one callback each and see `isPlaying` only when current, so
// with React Compiler a row whose own state didn't change returns its cached
// output.
function CaptionRow({
  row,
  languages,
  index,
  isCurrent,
  isPlaying,
  isRepeating,
  bookmarks,
  bookmarkNumberById,
  onClick,
  onToggleRepeat,
  onGoToBookmark,
  onDeleteBookmark,
  onPopoverOpenChange,
}: {
  row: MergedCaption;
  languages: [string, string];
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isRepeating: boolean;
  bookmarks?: ExtensionBookmark[];
  bookmarkNumberById: Map<string, number>;
  onClick: (index: number) => void;
  onToggleRepeat: (index: number) => void;
  onGoToBookmark: (bookmarkId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
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
        isPlaying && "ring-2 ring-ring",
        isCurrent ? "border-ring" : "border-border",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(index)}
    >
      <div className="flex items-center text-xs text-muted-foreground">
        <span>
          {formatTimestamp(row.begin)} – {formatTimestamp(row.end)}
        </span>
        <RepeatToggle
          className="-my-0.5 ml-auto"
          isRepeating={isRepeating}
          onToggle={() => onToggleRepeat(index)}
        />
      </div>
      <div className="flex text-(length:--caption-text-size) leading-(--text-sm--line-height)">
        <div className="flex-1 border-r pr-2" data-side="0" lang={languages[0]}>
          <HighlightedText
            text={row.text1}
            language={languages[0]}
            marks={text1Marks ?? []}
            onGoToBookmark={onGoToBookmark}
            onDeleteBookmark={onDeleteBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        </div>
        <div className="flex-1 pl-2" data-side="1" lang={languages[1]}>
          <HighlightedText
            text={row.text2}
            language={languages[1]}
            marks={text2Marks ?? []}
            onGoToBookmark={onGoToBookmark}
            onDeleteBookmark={onDeleteBookmark}
            onPopoverOpenChange={onPopoverOpenChange}
          />
        </div>
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  language,
  marks,
  onGoToBookmark,
  onDeleteBookmark,
  onPopoverOpenChange,
}: {
  text: string;
  language: string;
  marks: { bookmark: ExtensionBookmark; bookmarkNumber?: number }[];
  onGoToBookmark: (bookmarkId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
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
        language={language}
        offset={bookmark.offset}
        onGoToBookmark={onGoToBookmark}
        onDeleteBookmark={onDeleteBookmark}
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
  language,
  offset,
  children,
  onGoToBookmark,
  onDeleteBookmark,
  onPopoverOpenChange,
}: {
  bookmark: ExtensionBookmark;
  bookmarkNumber?: number;
  /** The popover renders in a portal, outside the caption's `lang` */
  language: string;
  offset: number;
  children: React.ReactNode;
  onGoToBookmark: (bookmarkId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const filled = !!bookmark.translation;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [textSize] = captionPanelPreferences.useValue("textSize");
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
        // The portal escapes the panel element that sets --caption-text-size,
        // so the popover sizes its text from the preference itself. Its width
        // is in em so that larger text doesn't squeeze each line to a few words.
        className="leading-[1.33]"
        style={{
          fontSize: `${textSize - 2}px`,
          width: "21em",
          maxWidth: "var(--radix-popover-content-available-width)",
        }}
        side="top"
        avoidCollisions
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(event) => {
          // When modal=false (extension shadow DOM), DismissableLayer closes
          // on pointerdown before the trigger's click can toggle. Prevent the
          // dismiss when clicking the trigger so the toggle handles it.
          // Use composedPath() because shadow DOM retargets event.target to
          // the host element.
          const target = event.detail.originalEvent.composedPath()[0] as Node;
          if (triggerRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
      >
        <span className="block font-medium text-popover-foreground">
          {bookmarkNumber !== undefined && (
            <span className="mr-1 text-muted-foreground">
              #{bookmarkNumber}
            </span>
          )}
          <span lang={language}>{bookmark.text}</span>
        </span>
        {bookmark.translation ? (
          <span className="block text-popover-foreground">
            {bookmark.translation}
          </span>
        ) : (
          <span className="block italic text-muted-foreground">unfilled</span>
        )}
        {bookmark.etymology && (
          <span className="mt-1 block text-muted-foreground">
            {bookmark.etymology}
          </span>
        )}
        {bookmark.notes && (
          <span className="mt-1 block max-h-[8em] overflow-y-auto text-muted-foreground">
            {bookmark.notes}
          </span>
        )}
        <div className="mt-1 flex items-center justify-end gap-1">
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
            title="Delete bookmark"
            onClick={() => {
              if (confirm(`Delete bookmark "${bookmark.text}"?`)) {
                // The highlight unmounts with the bookmark, which would leave
                // the open state behind and auto-scroll paused.
                changeOpen(false);
                onDeleteBookmark(bookmark.id);
              }
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
            title="Go to bookmark"
            onMouseDown={(event) => {
              event.stopPropagation();
              // The Captions tab gets hidden rather than unmounted, so an open
              // popover would stay on screen, anchored to a zero-size trigger.
              changeOpen(false);
              onGoToBookmark(bookmark.id);
            }}
          >
            <ExternalLink className="size-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
