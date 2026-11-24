import { EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { useImperativeHandle, useRef } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import { flashHighlight } from "../lib/flash-highlight.ts";
import { RepeatToggle } from "./repeat-toggle.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

export type BookmarksListHandle = {
  scrollToBookmark: (bookmarkId: string) => void;
};

export function ExtensionBookmarksList({
  ref,
  bookmarks,
  rows,
  currentIndex,
  isPlaying,
  repeatIndex,
  onClickBookmark,
  onToggleRepeat,
  onDeleteBookmark,
  onGoToCaption,
}: {
  ref: React.Ref<BookmarksListHandle>;
  bookmarks: ExtensionBookmark[];
  rows: MergedCaption[];
  currentIndex?: number;
  isPlaying: boolean;
  repeatIndex?: number;
  onClickBookmark: (bookmark: ExtensionBookmark) => void;
  onToggleRepeat: (captionIndex: number) => void;
  onDeleteBookmark: (id: string) => void;
  onGoToCaption: (captionIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBookmark: (bookmarkId: string) => {
      const element = scrollRef.current?.querySelector(
        `[data-bookmark-id="${bookmarkId}"]`,
      ) as HTMLElement | null;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(element);
      }
    },
  }));

  return (
    <div ref={scrollRef} className="flex flex-col gap-1.5 p-1.5">
      {bookmarks.map((bookmark, index) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          bookmarkNumber={index + 1}
          caption={rows[bookmark.captionIndex]}
          isCurrent={bookmark.captionIndex === currentIndex}
          isPlaying={isPlaying}
          isRepeating={bookmark.captionIndex === repeatIndex}
          onClick={() => onClickBookmark(bookmark)}
          onToggleRepeat={() => onToggleRepeat(bookmark.captionIndex)}
          onDelete={() => onDeleteBookmark(bookmark.id)}
          onGoToCaption={() => onGoToCaption(bookmark.captionIndex)}
        />
      ))}
    </div>
  );
}

function BookmarkCard({
  bookmark,
  bookmarkNumber,
  caption,
  isCurrent,
  isPlaying,
  isRepeating,
  onClick,
  onToggleRepeat,
  onDelete,
  onGoToCaption,
}: {
  bookmark: ExtensionBookmark;
  bookmarkNumber: number;
  caption?: MergedCaption;
  isCurrent: boolean;
  isPlaying: boolean;
  isRepeating: boolean;
  onClick: () => void;
  onToggleRepeat: () => void;
  onDelete: () => void;
  onGoToCaption: () => void;
}) {
  return (
    <div
      data-bookmark-id={bookmark.id}
      aria-current={isCurrent || undefined}
      className={[
        "flex cursor-pointer flex-col gap-1 border p-2 hover:bg-muted",
        isCurrent && isPlaying && "ring-2 ring-ring",
        isCurrent ? "border-ring" : "border-border",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <div className="flex items-start gap-1">
        <span className="shrink-0 text-xs text-muted-foreground">
          #{bookmarkNumber}
        </span>
        <div className="flex-1 text-sm font-medium">{bookmark.text}</div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTimestamp(bookmark.timestamp)}
        </span>
        {caption && (
          <RepeatToggle
            className="-mt-0.5 shrink-0 text-muted-foreground"
            isRepeating={isRepeating}
            onToggle={onToggleRepeat}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
            title="Bookmark actions"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm(`Delete bookmark "${bookmark.text}"?`)) {
                  onDelete();
                }
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {bookmark.translation && (
        <div className="text-sm text-muted-foreground">
          {bookmark.translation}
        </div>
      )}
      {bookmark.etymology && (
        <div className="text-sm text-muted-foreground">
          {bookmark.etymology}
        </div>
      )}
      {bookmark.notes && (
        <div className="text-sm text-muted-foreground">{bookmark.notes}</div>
      )}
      {caption && (
        <div className="mt-0.5 flex items-start gap-1 border-t border-border pt-1 text-sm text-muted-foreground">
          <div className="flex-1">
            <div>{caption.text1}</div>
            <div>{caption.text2}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!bookmark.translation && (
              <span className="rounded bg-muted px-1 text-muted-foreground">
                unfilled
              </span>
            )}
            <button
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Go to caption"
              onClick={(event) => {
                event.stopPropagation();
                onGoToCaption();
              }}
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      {!caption && !bookmark.translation && (
        <div className="text-xs">
          <span className="rounded bg-muted px-1 text-muted-foreground">
            unfilled
          </span>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
