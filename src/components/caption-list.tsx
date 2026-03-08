import { useEffect, useRef } from "react";
import type { YTPlayer } from "./youtube-player.tsx";

type AlignedRow = {
  begin: number;
  end: number;
  text1: string;
  text2: string;
  cue1Indices?: number[];
  cue2Indices?: number[];
};

function MergeBadge({ count }: { count: number | undefined }) {
  if (!count || count <= 1) return null;
  return <span className="ml-1 text-xs text-muted-foreground">×{count}</span>;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CaptionList({
  rows,
  currentIndex,
  isPlaying,
  player,
  autoScroll = true,
}: {
  rows: AlignedRow[];
  currentIndex: number | undefined;
  isPlaying: boolean;
  player: YTPlayer | null;
  autoScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (document.getSelection()?.toString()) return;
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
        {rows.map((row, i) => (
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
              <div className="flex-1 border-r pr-2">
                {row.text1}
                <MergeBadge count={row.cue1Indices?.length} />
              </div>
              <div className="flex-1 pl-2">
                {row.text2}
                <MergeBadge count={row.cue2Indices?.length} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
