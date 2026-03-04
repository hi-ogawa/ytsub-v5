import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }

  namespace YT {
    interface PlayerOptions {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, unknown>;
    }

    interface PlayerEvent {
      target: Player;
      data: number;
    }

    class Player {
      constructor(el: HTMLElement | string, opts: PlayerOptions);
      getCurrentTime(): number;
      seekTo(seconds: number, allowSeekAhead?: boolean): void;
      destroy(): void;
    }

    enum PlayerState {
      UNSTARTED = -1,
      ENDED = 0,
      PLAYING = 1,
      PAUSED = 2,
      BUFFERING = 3,
      CUED = 5,
    }
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function useYouTubePlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  youtubeId: string,
) {
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<YT.Player | null>(null);

  useEffect(() => {
    let destroyed = false;
    let rafId: number;

    function tick() {
      if (destroyed) return;
      if (playerRef.current) {
        try {
          setCurrentTime(playerRef.current.getCurrentTime());
        } catch {
          // player may not be ready yet
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    async function init() {
      await loadYouTubeApi();
      if (destroyed || !containerRef.current) return;

      playerRef.current = new YT.Player(containerRef.current, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
      });

      rafId = requestAnimationFrame(tick);
    }

    init();

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [youtubeId, containerRef]);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);

  return { currentTime, seekTo };
}
