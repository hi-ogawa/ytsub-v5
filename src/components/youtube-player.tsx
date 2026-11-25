import { useEffect, useRef, useState, type RefCallback } from "react";

// --- YouTube IFrame API types ---

declare let YT: {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: { start?: number; autoplay?: 0 | 1 };
      events?: { onReady?: () => void };
    },
  ) => YTIframePlayer;
};

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTIframePlayer extends YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string }): void;
}

// --- YouTube IFrame API loader (singleton) ---

let iframeApiPromise: Promise<void> | undefined;

function loadYoutubeIframeApi(): Promise<void> {
  if (iframeApiPromise) {
    return iframeApiPromise;
  }
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

export function useYouTubePlayer(
  youtubeId?: string,
  options?: { playFrom?: number },
) {
  const [player, setPlayer] = useState<YTIframePlayer>();
  const playerRef = useRef<YTIframePlayer>(undefined);
  const loadedRef = useRef<{ youtubeId: string; playFrom?: number }>(undefined);

  const ref: RefCallback<HTMLDivElement> = (element) => {
    if (!element || !youtubeId || playerRef.current) {
      return;
    }
    loadYoutubeIframeApi().then(() => {
      const p = new YT.Player(element, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        // `start` takes whole seconds
        playerVars:
          options?.playFrom === undefined
            ? undefined
            : { start: Math.floor(options.playFrom), autoplay: 1 },
        events: {
          onReady: () => {
            playerRef.current = p;
            loadedRef.current = { youtubeId, playFrom: options?.playFrom };
            setPlayer(p);
          },
        },
      });
    });
  };

  // The player is created once, so a route change to another video or start
  // time switches it in place instead of loading a new embed.
  const playFrom = options?.playFrom;
  useEffect(() => {
    const loaded = loadedRef.current;
    if (
      !player ||
      !youtubeId ||
      !loaded ||
      (loaded.youtubeId === youtubeId && loaded.playFrom === playFrom)
    ) {
      return;
    }
    loadedRef.current = { youtubeId, playFrom };
    if (playFrom === undefined) {
      if (loaded.youtubeId !== youtubeId) {
        player.cueVideoById({ videoId: youtubeId });
      }
    } else if (loaded.youtubeId === youtubeId) {
      player.seekTo(playFrom, true);
      player.playVideo();
    } else {
      player.loadVideoById({ videoId: youtubeId, startSeconds: playFrom });
    }
  }, [player, youtubeId, playFrom]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = undefined;
    };
  }, []);

  return { ref, player };
}
