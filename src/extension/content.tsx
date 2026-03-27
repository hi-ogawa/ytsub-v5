import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
  useFabOpen,
} from "../components/caption-panel.tsx";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import { getSession, saveSession } from "../lib/caption-session-db.ts";
import type { PersistedCaptionSession } from "../lib/caption-session-db.ts";
import { useStore } from "../lib/external-store.ts";
import { type SyncState, computeSyncState } from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import type { YouTubeExtractionResult } from "../lib/youtube.ts";
import { fetchPlayerApi, fetchTrackJson3 } from "../lib/youtube.ts";
import type { bgRpcHandlers } from "./background.ts";
import contentCss from "./content.css?inline";
import {
  createRuntimeRelayRpc,
  registerTabRpcHandlers,
} from "./lib/extension-rpc.ts";

const bgRpc = createRuntimeRelayRpc<typeof bgRpcHandlers>();

// Handlers for reverse (tab) RPC — background can request IDB access
// on the youtube.com origin through this content script.
export const tabRpcHandlers = {
  async getSession({ youtubeId }: { youtubeId: string }) {
    return await getSession(youtubeId);
  },
  async saveSession({ session }: { session: PersistedCaptionSession }) {
    await saveSession(session);
  },
};
registerTabRpcHandlers(tabRpcHandlers);

declare const __BUILD_TIME__: string;
declare const __GIT_REV__: string;
console.log(`[zamak] build: ${__BUILD_TIME__} (${__GIT_REV__})`);

// Adapter: wrap the page's <video> element as YTPlayer
function getVideoPlayer(): YTPlayer | undefined {
  const video = document.querySelector("video");
  if (!video) return undefined;
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
  const [open, toggleOpen] = useFabOpen(videoId);

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
      <CaptionFab open={open} onClick={toggleOpen} />
    </div>
  );
}

function getUserLangs(): string[] {
  const langs = [...navigator.languages];
  try {
    const pref = localStorage.getItem("zamak:preferred-langs");
    if (pref) {
      const { lang1, lang2 } = JSON.parse(pref);
      if (lang1 && !langs.includes(lang1)) langs.push(lang1);
      if (lang2 && !langs.includes(lang2)) langs.push(lang2);
    }
  } catch {}
  return langs;
}

function ExtensionViewer({ videoId }: { videoId: string }) {
  const [player] = useState(() => getVideoPlayer());

  const { data, isLoading, error } = useQuery({
    queryKey: ["extension-metadata", videoId],
    queryFn: () => fetchPlayerApi({ videoId, userLangs: getUserLangs() }),
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
      {data && <ExtensionSession data={data} player={player} />}
    </div>
  );
}

function useExtensionSyncState(youtubeId: string): SyncState {
  const [videoIndex] = useStore(videoIndexStore);
  const [serverResponse, setServerResponse] =
    useState<Awaited<ReturnType<typeof bgRpc.getSyncState>>>();

  useEffect(() => {
    bgRpc.getSyncState({ youtubeId }).then(setServerResponse);
  }, [youtubeId]);

  if (!serverResponse) return "checking";
  if (!serverResponse.authenticated) return "unauthenticated";

  const localEntry = videoIndex.find((e) => e.youtubeId === youtubeId);
  return computeSyncState({
    localUpdatedAt: localEntry?.updatedAt,
    syncedAt: localEntry?.syncedAt,
    serverUpdatedAt: serverResponse.serverUpdatedAt,
  });
}

function ExtensionSession({
  data,
  player,
}: {
  data: YouTubeExtractionResult;
  player?: YTPlayer;
}) {
  const state = useExtensionSyncState(data.video.youtubeId);
  const sync = { state, onNavigate: () => bgRpc.openBookmarks() };

  return (
    <CaptionPanel
      tracks={data.captionTracks}
      player={player}
      fetchJson3={(track) => fetchTrackJson3(track.baseUrl)}
      videoMeta={data.video}
      sync={sync}
    />
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
      retry: false,
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

function isYouTubeDark(): boolean {
  return document.documentElement.hasAttribute("dark");
}

function applyTheme(host: HTMLElement, container: HTMLElement) {
  const dark = isYouTubeDark();
  container.classList.toggle("dark", dark);
  host.classList.toggle("dark", dark);
}

let themeObserver: MutationObserver | undefined;

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

  // Match YouTube's dark/light theme
  applyTheme(host, container);
  themeObserver = new MutationObserver(() => applyTheme(host, container));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["dark"],
  });

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
  themeObserver?.disconnect();
  themeObserver = undefined;
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
