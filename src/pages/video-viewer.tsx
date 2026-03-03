import { useCallback, useEffect, useRef, useState } from "react";
import {
  FAKE_BOOKMARKS,
  FAKE_CAPTIONS,
  FAKE_VIDEOS,
  type Bookmark,
  type Caption,
} from "../data/fake.ts";

// Minimal YouTube IFrame API types
interface YTPlayer {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
  };
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function useYouTubePlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  videoId: string,
) {
  const playerRef = useRef<YTPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seekTo(time, true);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const initPlayer = () => {
      if (!containerRef.current || !window.YT) return;
      const el = document.createElement("div");
      containerRef.current.replaceChildren(el);
      playerRef.current = new window.YT.Player(el, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            interval = setInterval(() => {
              if (playerRef.current) {
                setCurrentTime(playerRef.current.getCurrentTime());
              }
            }, 200);
          },
        },
      });
    };

    if (window.YT) {
      initPlayer();
    } else {
      // Load the API script once
      if (!document.getElementById("yt-iframe-api")) {
        const script = document.createElement("script");
        script.id = "yt-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      clearInterval(interval);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [containerRef, videoId]);

  return { currentTime, seekTo };
}

function getCurrentIdx(captions: Caption[], time: number): number {
  return captions.findIndex((c) => time >= c.begin && time < c.end);
}

interface Props {
  videoId: number;
}

export function VideoViewer({ videoId }: Props) {
  const video = FAKE_VIDEOS.find((v) => v.id === videoId);
  const captions1 = FAKE_CAPTIONS.filter(
    (c) => c.videoId === videoId && c.language === (video?.language1 ?? "ko"),
  ).sort((a, b) => a.idx - b.idx);
  const captions2 = FAKE_CAPTIONS.filter(
    (c) => c.videoId === videoId && c.language === (video?.language2 ?? "en"),
  ).sort((a, b) => a.idx - b.idx);
  const bookmarks = FAKE_BOOKMARKS.filter((b) => b.videoId === videoId).sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const { currentTime, seekTo } = useYouTubePlayer(
    containerRef,
    video?.youtubeId ?? "",
  );

  const currentIdx = getCurrentIdx(captions1, currentTime);

  // Auto-scroll current caption into view
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  useEffect(() => {
    if (currentIdx >= 0) {
      rowRefs.current[currentIdx]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [currentIdx]);

  // Bookmark navigation
  const [bookmarkCursor, setBookmarkCursor] = useState(-1);

  const goPrevBookmark = () => {
    const cur = bookmarkCursor <= 0 ? bookmarks.length - 1 : bookmarkCursor - 1;
    setBookmarkCursor(cur);
    if (bookmarks[cur]) seekTo(bookmarks[cur].timestamp);
  };

  const goNextBookmark = () => {
    const cur = bookmarkCursor >= bookmarks.length - 1 ? 0 : bookmarkCursor + 1;
    setBookmarkCursor(cur);
    if (bookmarks[cur]) seekTo(bookmarks[cur].timestamp);
  };

  const activeBookmark: Bookmark | undefined =
    bookmarkCursor >= 0 ? bookmarks[bookmarkCursor] : undefined;

  if (!video) {
    return <div className="p-8 text-gray-500">Video not found.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Video title bar */}
      <div className="border-b border-gray-200 bg-white px-4 py-2">
        <p className="truncate text-sm font-medium text-gray-800">
          {video.title}
        </p>
        <p className="text-xs text-gray-500">{video.channelName}</p>
      </div>

      {/* Main split layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: YouTube embed */}
        <div className="flex w-1/2 shrink-0 flex-col border-r border-gray-200 bg-black">
          <div
            ref={containerRef}
            className="aspect-video w-full [&>div]:h-full [&>div]:w-full [&>iframe]:h-full [&>iframe]:w-full"
          />
          {/* Bookmark navigation bar */}
          {bookmarks.length > 0 && (
            <div className="flex items-center gap-3 border-t border-gray-700 bg-gray-900 px-4 py-2">
              <span className="text-xs text-gray-400">
                Bookmarks ({bookmarks.length})
              </span>
              <button
                onClick={goPrevBookmark}
                className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                title="Previous bookmark"
              >
                ← Prev
              </button>
              <button
                onClick={goNextBookmark}
                className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                title="Next bookmark"
              >
                Next →
              </button>
              {activeBookmark && (
                <span className="ml-auto max-w-[180px] truncate text-xs text-amber-300">
                  {activeBookmark.text} — {activeBookmark.translation}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Dual caption panel */}
        <div className="flex min-h-0 w-1/2 flex-col">
          {/* Column header */}
          <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div className="w-1/2 px-3 py-2">{video.language1}</div>
            <div className="w-1/2 border-l border-gray-200 px-3 py-2">
              {video.language2}
            </div>
          </div>

          {/* Scrollable caption rows */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {captions1.map((c1, i) => {
                  const c2 = captions2[i];
                  const isCurrent = i === currentIdx;
                  // Check if this row has a bookmark
                  const hasBookmark = bookmarks.some(
                    (b) => b.timestamp >= c1.begin && b.timestamp < c1.end,
                  );
                  const isActiveBookmark =
                    activeBookmark !== undefined &&
                    activeBookmark.timestamp >= c1.begin &&
                    activeBookmark.timestamp < c1.end;

                  return (
                    <tr
                      key={c1.id}
                      ref={(el) => {
                        rowRefs.current[i] = el;
                      }}
                      onClick={() => seekTo(c1.begin)}
                      className={[
                        "cursor-pointer border-b border-gray-100 transition-colors",
                        isCurrent
                          ? "bg-blue-50"
                          : isActiveBookmark
                            ? "bg-amber-50"
                            : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <td className="w-1/2 px-3 py-2 align-top">
                        <span
                          className={
                            isCurrent ? "font-medium text-blue-800" : ""
                          }
                        >
                          {c1.text}
                        </span>
                        {hasBookmark && (
                          <span
                            className="ml-1 text-amber-500"
                            title="bookmark"
                          >
                            ★
                          </span>
                        )}
                      </td>
                      <td className="w-1/2 border-l border-gray-100 px-3 py-2 align-top text-gray-500">
                        {c2?.text ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
