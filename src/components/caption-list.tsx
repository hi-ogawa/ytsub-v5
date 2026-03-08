import { useEffect, useRef } from "react";
import type { YTPlayer } from "./youtube-player.tsx";

export type AlignedRow = {
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

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
}: {
  rows: AlignedRow[];
  currentIndex: number | undefined;
  isPlaying: boolean;
  player: YTPlayer | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollIndex = useRef<number | undefined>(undefined);

  // Auto-scroll to current
  useEffect(() => {
    if (currentIndex === undefined || currentIndex === prevScrollIndex.current)
      return;
    prevScrollIndex.current = currentIndex;
    const el = scrollRef.current?.querySelector(
      `[data-index="${currentIndex}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIndex]);

  function onClickRow(index: number) {
    if (!player) return;
    if (document.getSelection()?.toString()) return;
    if (index === currentIndex) {
      isPlaying ? player.pauseVideo() : player.playVideo();
    } else {
      player.seekTo(rows[index].begin);
      player.playVideo();
    }
  }

  return (
    <div className="flex-[1_0_0] overflow-y-auto" ref={scrollRef}>
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
              <div className="flex-1 border-r pr-2">{row.text1}</div>
              <div className="flex-1 pl-2">{row.text2}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
