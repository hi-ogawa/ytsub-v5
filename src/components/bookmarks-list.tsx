import { EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { useImperativeHandle, useRef } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import { flashHighlight } from "../lib/flash-highlight.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

export type BookmarksListHandle = {
  scrollToBookmark: (bookmarkId: string) => void;
};

export function ExtensionBookmarksList({
  ref,
  bookmarks,
  rows,
  player,
  onDeleteBookmark,
  onGoToCaption,
}: {
  ref: React.Ref<BookmarksListHandle>;
  bookmarks: ExtensionBookmark[];
  rows: MergedCaption[];
  player?: YTPlayer;
  onDeleteBookmark: (id: string) => void;
  onGoToCaption: (captionIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBookmark: (bookmarkId: string) => {
      const el = scrollRef.current?.querySelector(
        `[data-bookmark-id="${bookmarkId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(el);
      }
    },
  }));

  return (
    <div ref={scrollRef} className="flex flex-col gap-1.5 p-1.5">
      {bookmarks.map((bm, bmIndex) => {
        const caption = rows[bm.captionIndex];
        return (
          <div
            key={bm.id}
            data-bookmark-id={bm.id}
            className="flex cursor-pointer flex-col gap-1 border border-border p-2 hover:bg-muted"
            onClick={() => {
              if (!player) {
                return;
              }
              player.seekTo(bm.timestamp);
              player.playVideo();
            }}
          >
            <div className="flex items-start gap-1">
              <span className="shrink-0 text-xs text-muted-foreground">
                #{bmIndex + 1}
              </span>
              <div className="flex-1 text-sm font-medium">{bm.text}</div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatTimestamp(bm.timestamp)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EllipsisVertical className="size-3.5" />
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
                    <Trash2 className="mr-2 size-4" />
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
              <div className="text-sm text-muted-foreground">
                {bm.etymology}
              </div>
            )}
            {bm.notes && (
              <div className="text-sm text-muted-foreground">{bm.notes}</div>
            )}
            {caption && (
              <div className="mt-0.5 flex items-start gap-1 border-t border-border pt-1 text-sm text-muted-foreground">
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
                  <button
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Go to caption"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGoToCaption(bm.captionIndex);
                    }}
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
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

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
