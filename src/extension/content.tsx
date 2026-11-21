import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CaptionFab,
  CaptionPanel,
  ResizablePanel,
  useFabOpen,
} from "../components/caption-panel.tsx";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import type { CaptionSessionManager } from "../lib/caption-session.ts";
import {
  captionStorage,
  initCaptionStorage,
  loadVideoIndex,
} from "../lib/caption-storage.ts";
import { useStore } from "../lib/external-store.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
} from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import type { YouTubeExtractionResult } from "../lib/youtube.ts";
import { fetchPlayerApi, fetchTrackJson3 } from "../lib/youtube.ts";
import type { bgRpcHandlers } from "./background.ts";
import contentCss from "./content.css?inline";
import { createRuntimeRelayRpc } from "./lib/extension-rpc.ts";
import { createBridgeStorage } from "./lib/storage-bridge.ts";
import { readYouTubeLegacyData } from "./lib/youtube-legacy-data.ts";

const bgRpc = createRuntimeRelayRpc<typeof bgRpcHandlers>();

// Copies youtube.com data into extension storage once, then loads the index.
let storageReady: Promise<void> | undefined;

function prepareStorage() {
  storageReady ??= (async () => {
    if (!(await captionStorage.isLegacyImported("youtube"))) {
      await captionStorage.importLegacy(
        "youtube",
        await readYouTubeLegacyData(),
      );
    }
    await loadVideoIndex();
  })();
  return storageReady;
}

declare const __BUILD_TIME__: string;
declare const __GIT_REV__: string;

// Adapter: wrap the page's <video> element as YTPlayer
function getVideoPlayer(): YTPlayer | undefined {
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
      if (lang1 && !langs.includes(lang1)) {
        langs.push(lang1);
      }
      if (lang2 && !langs.includes(lang2)) {
        langs.push(lang2);
      }
    }
  } catch {}
  return langs;
}

function ExtensionViewer({ videoId }: { videoId: string }) {
  const [player] = useState(() => getVideoPlayer());

  const metadataQuery = useQuery({
    queryKey: ["extension-metadata", videoId],
    queryFn: () => fetchPlayerApi({ videoId, userLangs: getUserLangs() }),
  });
  // The panel reads the index synchronously, so it waits for the first load.
  const storageQuery = useQuery({
    queryKey: ["extension-storage"],
    queryFn: () => prepareStorage().then(() => true),
    staleTime: Infinity,
    retry: false,
  });
  const { data } = metadataQuery;
  const isLoading = metadataQuery.isLoading || storageQuery.isLoading;
  const error = metadataQuery.error ?? storageQuery.error;

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

type SyncAction =
  | { direction: "push" }
  | { direction: "pull"; store: CaptionSessionManager };

function useExtensionSync(youtubeId: string): SyncStatus {
  const [videoIndex] = useStore(videoIndexStore);

  const serverQuery = useQuery({
    queryKey: ["extension-sync-state", youtubeId],
    queryFn: () => bgRpc.getSyncState({ youtubeId }),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: SyncAction) => {
      if (action.direction === "push") {
        const { serverUpdatedAt } = await bgRpc.pushSession({ youtubeId });
        await captionStorage.setSyncedAt(youtubeId, serverUpdatedAt);
      } else {
        const { session, serverUpdatedAt } = await bgRpc.fetchSession({
          youtubeId,
        });
        // replace() bumps the index entry's updatedAt, so setSyncedAt must follow it.
        await action.store.replace({
          vssId1: session.vssId1,
          vssId2: session.vssId2,
          captions: session.captions,
          bookmarks: session.bookmarks,
        });
        await captionStorage.setSyncedAt(youtubeId, serverUpdatedAt);
      }
    },
    onSuccess: () => serverQuery.refetch(),
  });

  const getState = (): SyncState => {
    if (syncMutation.isPending) {
      return "syncing";
    }
    if (serverQuery.isPending) {
      return "checking";
    }
    if (serverQuery.isError) {
      return "error";
    }
    if (!serverQuery.data.authenticated) {
      return "unauthenticated";
    }
    const localEntry = videoIndex.find((e) => e.youtubeId === youtubeId);
    return computeSyncState({
      localUpdatedAt: localEntry?.updatedAt,
      syncedAt: localEntry?.syncedAt,
      syncedServerUpdatedAt: localEntry?.syncedServerUpdatedAt,
      serverUpdatedAt: serverQuery.data.serverUpdatedAt,
    });
  };

  const { error, variables } = syncMutation;

  return {
    state: getState(),
    error: error
      ? `${variables?.direction === "pull" ? "Download" : "Upload"} failed: ${error.message}`
      : undefined,
    onNavigate: () => bgRpc.openBookmarks(),
    onRefresh: () => serverQuery.refetch({ cancelRefetch: false }),
    onPush: () => syncMutation.mutate({ direction: "push" }),
    onPull: (store) => syncMutation.mutate({ direction: "pull", store }),
  };
}

function ExtensionSession({
  data,
  player,
}: {
  data: YouTubeExtractionResult;
  player?: YTPlayer;
}) {
  const sync = useExtensionSync(data.video.youtubeId);

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
  if (document.getElementById("zamak-host")) {
    return;
  }

  const videoId = getVideoId();
  if (!videoId) {
    return;
  }

  prepareStorage().catch(() => {});

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

function main() {
  console.log(`[zamak] build: ${__BUILD_TIME__} (${__GIT_REV__})`);
  initCaptionStorage(createBridgeStorage());

  // YouTube SPA navigation
  if (isWatchPage()) {
    inject();
  }

  document.addEventListener("yt-navigate-start", remove);
  document.addEventListener("yt-navigate-finish", () => {
    if (isWatchPage()) {
      inject();
    }
  });
}

main();
