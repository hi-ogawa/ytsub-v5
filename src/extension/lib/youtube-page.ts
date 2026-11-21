import type { YTPlayer } from "../../components/youtube-player.tsx";

export function isWatchPage() {
  return window.location.pathname === "/watch";
}

export function getVideoId() {
  return new URL(window.location.href).searchParams.get("v");
}

export function isYouTubeDark(): boolean {
  return document.documentElement.hasAttribute("dark");
}

// Adapter: wrap the page's <video> element as YTPlayer
export function getVideoPlayer(): YTPlayer | undefined {
  const video = document.querySelector("video");
  if (!video) {
    return undefined;
  }
  return {
    playVideo: () => void video.play(),
    pauseVideo: () => video.pause(),
    seekTo: (seconds: number) => {
      video.currentTime = seconds;
    },
    getCurrentTime: () => video.currentTime,
    getPlayerState: () => (video.paused ? 2 : 1),
    destroy: () => {},
  };
}
