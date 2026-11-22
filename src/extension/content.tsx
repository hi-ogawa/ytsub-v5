import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptionStorageProvider } from "../components/caption-storage-context.ts";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import type { CaptionStorage } from "../lib/caption-storage.ts";
import { createShadowHost } from "../utils/shadow-root.ts";
import type { bgRpcHandlers } from "./background.ts";
import { CaptionOverlay } from "./components/caption-overlay.tsx";
import { useExtensionSync } from "./components/use-extension-sync.ts";
import contentCss from "./content.css?inline";
import { createRuntimeRelayRpc } from "./lib/extension-rpc.ts";
import { createBridgeStorage } from "./lib/storage-bridge.ts";
import {
  subscribeWatchPage,
  subscribeYouTubeTheme,
} from "./lib/youtube-page.ts";

declare const __BUILD_TIME__: string;
declare const __GIT_REV__: string;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const bgRpc = createRuntimeRelayRpc<typeof bgRpcHandlers>();

function main() {
  console.log(`[zamak] build: ${__BUILD_TIME__} (${__GIT_REV__})`);
  const storage = createBridgeStorage();

  subscribeWatchPage({
    onEnter: (videoId) => mountOverlay({ storage, videoId }),
  });
}

function mountOverlay({
  storage,
  videoId,
}: {
  storage: CaptionStorage;
  videoId: string;
}) {
  const { host, container } = createShadowHost({
    id: "zamak-host",
    css: contentCss,
    style: {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      fontFamily: "'Roboto', 'Arial', sans-serif",
      fontSize: "14px",
    },
  });

  const unsubscribeTheme = subscribeYouTubeTheme((dark) => {
    container.classList.toggle("dark", dark);
    host.classList.toggle("dark", dark);
  });

  createRoot(container).render(
    <StrictMode>
      <PortalContainerProvider value={container}>
        <QueryClientProvider client={queryClient}>
          <CaptionStorageProvider value={storage}>
            <CaptionOverlay
              videoId={videoId}
              useSync={(youtubeId) => useExtensionSync({ bgRpc, youtubeId })}
            />
          </CaptionStorageProvider>
        </QueryClientProvider>
      </PortalContainerProvider>
    </StrictMode>,
  );

  return () => {
    unsubscribeTheme();
    host.remove();
  };
}

main();
