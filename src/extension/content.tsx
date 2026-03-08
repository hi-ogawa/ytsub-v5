import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { StrictMode, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
} from "../components/caption-panel.tsx";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  addBookmark,
  getBookmarks,
} from "../lib/extension-bookmarks.ts";
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
        <ResizablePanel
          id="zamak-root"
          style={{
            position: "fixed",
            right: "10px",
            top: "65px",
            bottom: "56px",
            pointerEvents: "auto",
          }}
        >
          <ExtensionViewer videoId={videoId} />
        </ResizablePanel>
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
  const [bookmarks, setBookmarks] = useState<ExtensionBookmark[]>(() =>
    getBookmarks(videoId),
  );

  const bookmarksByIndex = useMemo(() => {
    const map = new Map<number, ExtensionBookmark[]>();
    for (const bm of bookmarks) {
      const list = map.get(bm.captionIndex);
      if (list) list.push(bm);
      else map.set(bm.captionIndex, [bm]);
    }
    return map;
  }, [bookmarks]);

  const onCreateBookmark = useCallback(
    (sel: BookmarkSelection & { timestamp: number; context: string }) => {
      addBookmark(videoId, {
        text: sel.text,
        side: sel.side,
        offset: sel.offset,
        captionIndex: sel.captionIndex,
        timestamp: sel.timestamp,
        context: sel.context,
      });
      setBookmarks(getBookmarks(videoId));
    },
    [videoId],
  );

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
          videoMeta={data.video}
          onCreateBookmark={onCreateBookmark}
          bookmarksByIndex={bookmarksByIndex}
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function getVideoId() {
  return new URL(window.location.href).searchParams.get("v");
}

function inject() {
  if (document.getElementById("zamak-host")) return;

  const videoId = getVideoId();
  if (!videoId) return;

  // Create shadow root for style isolation.
  // Inline styles here because `all: initial` resets everything and
  // inline styles beat :host stylesheet rules. Use :host in content.css
  // only for CSS custom properties (unaffected by `all: initial`).
  const host = document.createElement("div");
  host.id = "zamak-host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    fontFamily: "'Roboto', 'Arial', sans-serif",
    fontSize: "14px",
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  addStyle(shadow, contentCss);

  const container = document.createElement("div");
  shadow.appendChild(container);

  createRoot(container).render(
    <StrictMode>
      <PortalContainerProvider value={container}>
        <QueryClientProvider client={queryClient}>
          <App videoId={videoId} />
        </QueryClientProvider>
      </PortalContainerProvider>
    </StrictMode>,
  );
}

function remove() {
  document.getElementById("zamak-host")?.remove();
}

// YouTube SPA navigation
function init() {
  if (isWatchPage()) inject();

  document.addEventListener("yt-navigate-start", remove);
  document.addEventListener("yt-navigate-finish", () => {
    if (isWatchPage()) inject();
  });
}

init();
