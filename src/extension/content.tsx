import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { CaptionFab, CaptionPanel } from "../components/caption-panel.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import {
  type YouTubeCaptionTrack,
  fetchPlayerApi,
  fetchTrackJson3,
  parseJson3,
} from "../lib/youtube.ts";
import contentCss from "./content.css?inline";

// Adapter: wrap the page's <video> element as YTPlayer
function getVideoPlayer(): YTPlayer | null {
  const video = document.querySelector("video");
  if (!video) return null;
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

function App({ videoId }: { videoId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {open && (
        <div
          id="ytsub-root"
          style={{
            position: "fixed",
            right: "10px",
            top: "65px",
            bottom: "80px",
            width: "400px",
            pointerEvents: "auto",
          }}
        >
          <ExtensionViewer videoId={videoId} />
        </div>
      )}
      <CaptionFab open={open} onClick={() => setOpen((v) => !v)} />
    </div>
  );
}

function fetchCues(track: YouTubeCaptionTrack) {
  return fetchTrackJson3(track.baseUrl).then(parseJson3);
}

function ExtensionViewer({ videoId }: { videoId: string }) {
  const [player] = useState<YTPlayer | null>(() => getVideoPlayer());

  const { data, isLoading, error } = useQuery({
    queryKey: ["extension-metadata", videoId],
    queryFn: () => fetchPlayerApi(videoId),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading subtitles…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {String(error)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {data && (
        <CaptionPanel
          tracks={data.captionTracks}
          fetchCues={fetchCues}
          player={player}
        />
      )}
    </div>
  );
}

// --- Style injection ---

// Inject CSS into shadow root, hoisting @property declarations to document head
// because @property doesn't work inside Shadow DOM <style> elements.
// https://github.com/tailwindlabs/tailwindcss/issues/15005#issuecomment-3891099776
function addStyle(shadow: ShadowRoot, css: string) {
  const processed = css.replaceAll(":root", ":host");

  const propertyRules: string[] = [];
  const shadowCss = processed.replace(
    /@property\s+[^{]+\{[^}]*\}/g,
    (match) => {
      propertyRules.push(match);
      return "";
    },
  );

  if (propertyRules.length > 0) {
    const propStyle = document.createElement("style");
    propStyle.textContent = propertyRules.join("\n");
    document.head.appendChild(propStyle);
  }

  const style = document.createElement("style");
  style.textContent = shadowCss;
  shadow.appendChild(style);
}

// --- Injection ---

const queryClient = new QueryClient();

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function getVideoId() {
  return new URL(window.location.href).searchParams.get("v");
}

function inject() {
  if (document.getElementById("ytsub-host")) return;

  const videoId = getVideoId();
  if (!videoId) return;

  // Create shadow root for style isolation
  const host = document.createElement("div");
  host.id = "ytsub-host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  addStyle(shadow, contentCss);

  const container = document.createElement("div");
  shadow.appendChild(container);

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App videoId={videoId} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

function remove() {
  document.getElementById("ytsub-host")?.remove();
}

// YouTube SPA navigation
function init() {
  if (isWatchPage()) inject();

  document.addEventListener("yt-navigate-finish", () => {
    remove();
    if (isWatchPage()) inject();
  });
}

init();
