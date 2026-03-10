import { useEffect, useImperativeHandle, useRef } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
import type { ExtensionBookmark } from "../lib/extension-bookmarks.ts";
import type { YTPlayer } from "./youtube-player.tsx";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function highlightText(
  text: string,
  marks: { offset: number; length: number }[],
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
    parts.push(
      <span
        key={`h${m.offset}`}
        data-offset={m.offset}
        className="border-b-2 border-highlight-border bg-highlight-bg"
      >
        {text.slice(m.offset, end)}
      </span>,
    );
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
}: {
  ref?: React.Ref<{ scrollToIndex: (index: number) => void }>;
  rows: MergedCaption[];
  currentIndex: number | undefined;
  isPlaying: boolean;
  player: YTPlayer | null;
  autoScroll?: boolean;
  bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      const el = scrollRef.current?.querySelector(`[data-index="${index}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
  }));
  const prevScrollIndex = useRef<number | undefined>(undefined);
  const isManualScrollRef = useRef(false);
  const manualScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (!autoScroll || isManualScrollRef.current) return;

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
            .map((b) => ({ offset: b.offset, length: b.text.length }));
          const text2Marks = rowBookmarks
            ?.filter((b) => b.side === 1)
            .map((b) => ({ offset: b.offset, length: b.text.length }));

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
                  {highlightText(row.text1, text1Marks ?? [])}
                </div>
                <div className="flex-1 pl-2" data-side="1">
                  {highlightText(row.text2, text2Marks ?? [])}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
