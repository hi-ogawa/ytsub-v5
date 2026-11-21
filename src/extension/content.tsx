import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PortalContainerProvider } from "../components/ui/portal-container.tsx";
import { initCaptionStorage } from "../lib/caption-storage.ts";
import { addShadowStyle } from "../utils/shadow-style.ts";
import { CaptionOverlay } from "./caption-overlay.tsx";
import contentCss from "./content.css?inline";
import { createBridgeStorage } from "./lib/storage-bridge.ts";
import { getVideoId, isWatchPage, isYouTubeDark } from "./lib/youtube-page.ts";

declare const __BUILD_TIME__: string;
declare const __GIT_REV__: string;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

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
          <CaptionOverlay videoId={videoId} />
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
