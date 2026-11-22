import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { CaptionStorageProvider } from "../components/caption-storage-context.ts";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import {
  loadVideoIndex,
  updateVideoIndexStore,
} from "../lib/caption-storage.ts";
import { createAppQueryClient } from "../lib/query-client.ts";
import { setRpcConfig } from "../lib/rpc-client.ts";
import { ExtensionBookmarksPage } from "./components/bookmarks-page.tsx";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { getServerUrl } from "./lib/server-url.ts";
import "../styles.css";

declare const __DEV_EXT__: boolean;

const queryClient = createAppQueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

async function main() {
  const storage = idbCaptionStorage;
  storage.subscribe(updateVideoIndexStore);
  await loadVideoIndex(storage);
  const serverUrl = await getServerUrl();

  // Configure RPC to use extension server URL + bearer token auth
  setRpcConfig({
    url: async () => new URL("/api", serverUrl),
    fetch: async (request) => {
      const token = await chromeStorage.get<string>("session-token");
      if (token) {
        const headers = new Headers(
          request instanceof Request ? request.headers : undefined,
        );
        headers.set("authorization", `Bearer ${token}`);
        request = new Request(request, { headers });
      }
      return fetch(request);
    },
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CaptionStorageProvider value={storage}>
            <ExtensionBookmarksPage
              serverUrl={serverUrl}
              isDevelopment={__DEV_EXT__}
            />
          </CaptionStorageProvider>
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

main();
