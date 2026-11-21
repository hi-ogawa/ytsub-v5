import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import { initCaptionStorage } from "../lib/caption-storage.ts";
import { addShadowStyle } from "../utils/shadow-style.ts";
import type { bgRpcHandlers } from "./background.ts";
import { CaptionOverlay } from "./components/caption-overlay.tsx";
import { createUseExtensionSync } from "./components/use-extension-sync.ts";
import contentCss from "./content.css?inline";
import { createRuntimeRelayRpc } from "./lib/extension-rpc.ts";
import { createBridgeStorage } from "./lib/storage-bridge.ts";
import {
  getVideoId,
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

const useSync = createUseExtensionSync(
  createRuntimeRelayRpc<typeof bgRpcHandlers>(),
);

let unsubscribeTheme: (() => void) | undefined;

function main() {
  console.log(`[zamak] build: ${__BUILD_TIME__} (${__GIT_REV__})`);
  initCaptionStorage(createBridgeStorage());

  subscribeWatchPage({ onEnter: injectOverlay, onLeave: removeOverlay });
}

function injectOverlay() {
  if (document.getElementById("zamak-host")) {
    return;
  }

  const videoId = getVideoId();
  if (!videoId) {
    return;
  }

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

  addShadowStyle(shadow, contentCss);

  const container = document.createElement("div");
  shadow.appendChild(container);

  unsubscribeTheme = subscribeYouTubeTheme((dark) =>
    applyTheme(host, container, dark),
  );

  createRoot(container).render(
    <StrictMode>
      <PortalContainerProvider value={container}>
        <QueryClientProvider client={queryClient}>
          <CaptionOverlay videoId={videoId} useSync={useSync} />
        </QueryClientProvider>
      </PortalContainerProvider>
    </StrictMode>,
  );
}

function applyTheme(host: HTMLElement, container: HTMLElement, dark: boolean) {
  container.classList.toggle("dark", dark);
  host.classList.toggle("dark", dark);
}

function removeOverlay() {
  unsubscribeTheme?.();
  unsubscribeTheme = undefined;
  document.getElementById("zamak-host")?.remove();
}

main();
