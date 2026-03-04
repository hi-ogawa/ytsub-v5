import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { useParams } from "react-router";
import { orpc } from "../rpc.ts";

// --- YouTube IFrame API types ---

declare let YT: {
  Player: new (
    el: HTMLElement | string,
    options: {
      videoId: string;
      events?: {
        onReady?: () => void;
      };
    },
  ) => YTPlayer;
};

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

// --- YouTube IFrame API loader (singleton) ---

let iframeApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
    // YT API calls this global when ready
    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady =
      () => {
        resolve();
      };
  });
  return iframeApiPromise;
}

async function createYoutubePlayer(
  el: HTMLElement,
  videoId: string,
): Promise<YTPlayer> {
  await loadYoutubeIframeApi();
  return new Promise<YTPlayer>((resolve) => {
    const player = new YT.Player(el, {
      videoId,
      events: { onReady: () => resolve(player) },
    });
  });
}

// --- useYouTubePlayer hook ---

function useYouTubePlayer(youtubeId: string | undefined) {
  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const ref: RefCallback<HTMLDivElement> = useCallback(
    (el) => {
      if (!el || !youtubeId || playerRef.current) return;
      createYoutubePlayer(el, youtubeId).then((p) => {
        playerRef.current = p;
        setPlayer(p);
      });
    },
    [youtubeId],
  );

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return { ref, player };
}

// --- Helpers ---

type Caption = {
  id: number;
  videoId: number;
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

function findCurrentEntry(
  entries: Caption[],
  time: number,
): number | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].begin <= time) {
      return i;
    }
  }
  return undefined;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Components ---

export function VideoViewerPage() {
  const { id } = useParams<"id">();
  const videoId = Number(id);

  const videoQuery = useQuery(
    orpc.videos.getVideo.queryOptions({ input: { id: videoId } }),
  );
  const captionsQuery = useQuery(
    orpc.videos.listCaptions.queryOptions({ input: { videoId } }),
  );

  const video = videoQuery.data;
  const captions = captionsQuery.data ?? [];

  const { ref: playerRef, player } = useYouTubePlayer(video?.youtubeId);

  const [currentIndex, setCurrentIndex] = useState<number | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);

  // Virtualizer
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: captions.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  // RAF loop — poll player time, update current entry, auto-scroll
  useEffect(() => {
    if (!player || captions.length === 0) return;

    let rafId: number;
    const loop = () => {
      const playing = player.getPlayerState() === 1;
      setIsPlaying(playing);

      if (playing) {
        const time = player.getCurrentTime();
        const nextIndex = findCurrentEntry(captions, time);

        setCurrentIndex((prev) => {
          if (nextIndex !== prev && nextIndex !== undefined) {
            // Auto-scroll when entry changes
            const scrollEl = scrollElementRef.current;
            if (scrollEl) {
              const { scrollTop, clientHeight } = scrollEl;
              const currentCenter = scrollTop + clientHeight / 2;
              const threshold = clientHeight / 6;
              const items = virtualizer.getVirtualItems();
              const item = items.find((it) => it.index === nextIndex);
              if (!item || Math.abs(item.start - currentCenter) > threshold) {
                virtualizer.scrollToIndex(nextIndex, {
                  align: "center",
                  behavior: "auto",
                });
              }
            }
          }
          return nextIndex;
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [player, captions, virtualizer]);

  // Click-to-seek
  function onClickEntry(index: number) {
    if (!player) return;
    // Don't seek if user is selecting text
    if (document.getSelection()?.toString()) return;

    const entry = captions[index];
    if (index === currentIndex) {
      // Toggle play/pause on current entry
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    } else {
      player.seekTo(entry.begin);
      player.playVideo();
    }
  }

  if (videoQuery.isLoading || captionsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (videoQuery.isError || !video) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-500">Failed to load video.</p>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full w-full flex-col lg:flex-row lg:gap-2 lg:p-2">
      {/* YouTube embed */}
      <div className="flex-none lg:flex-1">
        <div className="flex justify-center">
          <div className="relative w-full max-w-xl lg:max-w-none">
            <div className="relative pt-[56.2%]">
              <div className="absolute top-0 h-full w-full" ref={playerRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Caption panel */}
      <div className="flex min-h-0 flex-[1_0_0] flex-col border-t lg:w-1/3 lg:flex-none lg:border lg:rounded">
        <div
          className="h-full flex-[1_0_0] overflow-y-auto"
          ref={scrollElementRef}
        >
          {captions.length > 0 && virtualItems.length > 0 && (
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
                  const entry = captions[item.index];
                  const isCurrent = item.index === currentIndex;
                  const isEntryPlaying = isCurrent && isPlaying;

                  return (
                    <div
                      key={item.key}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      className={[
                        "flex w-full flex-col gap-1 border p-1 px-2",
                        isEntryPlaying && "ring-2 ring-blue-300",
                        isCurrent ? "border-blue-500" : "border-gray-200",
                        item.index === 0 && "mt-1.5",
                        item.index === captions.length - 1 && "mb-1.5",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex items-center text-xs text-gray-400">
                        <span className="ml-auto">
                          {formatTimestamp(entry.begin)} –{" "}
                          {formatTimestamp(entry.end)}
                        </span>
                      </div>
                      <div
                        className="flex cursor-pointer text-sm"
                        onClick={() => onClickEntry(item.index)}
                      >
                        <div className="flex-1 border-r pr-2">
                          {entry.text1}
                        </div>
                        <div className="flex-1 pl-2">{entry.text2}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
