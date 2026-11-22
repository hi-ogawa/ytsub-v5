import type { YTPlayer } from "../../components/youtube-player.tsx";

// YouTube navigates as a single-page app, so the content script runs once and
// follows its navigation events. onEnter returns the cleanup to run when the
// page is left.
export function subscribeWatchPage({
  onEnter,
}: {
  onEnter: (youtubeId: string) => () => void;
}) {
  let leave: (() => void) | undefined;
  const enter = () => {
    const youtubeId = getYoutubeId();
    if (isWatchPage() && youtubeId && !leave) {
      leave = onEnter(youtubeId);
    }
  };
  enter();
  document.addEventListener("yt-navigate-start", () => {
    leave?.();
    leave = undefined;
  });
  document.addEventListener("yt-navigate-finish", enter);
}

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function getYoutubeId() {
  return new URL(window.location.href).searchParams.get("v");
}

// Calls onChange with the current theme right away, then on each change.
export function subscribeYouTubeTheme(onChange: (dark: boolean) => void) {
  const notify = () => onChange(document.documentElement.hasAttribute("dark"));
  notify();
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["dark"],
  });
  return () => observer.disconnect();
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
