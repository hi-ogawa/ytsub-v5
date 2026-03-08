import { useEffect, useRef, useState, type RefCallback } from "react";

// --- YouTube IFrame API types ---

declare let YT: {
  Player: new (
    el: HTMLElement | string,
    options: {
      videoId: string;
      width?: string;
      height?: string;
      events?: { onReady?: () => void };
    },
  ) => YTPlayer;
};

export interface YTPlayer {
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
    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady =
      () => resolve();
  });
  return iframeApiPromise;
}

// --- Hook ---

export function useYouTubePlayer(youtubeId: string | undefined) {
  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const ref: RefCallback<HTMLDivElement> = (el) => {
    if (!el || !youtubeId || playerRef.current) return;
    loadYoutubeIframeApi().then(() => {
      const p = new YT.Player(el, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        events: {
          onReady: () => {
            playerRef.current = p;
            setPlayer(p);
          },
        },
      });
    });
  };

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return { ref, player };
}
