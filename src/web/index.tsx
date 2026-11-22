import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptionStorageProvider } from "../components/caption-storage-context.ts";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import {
  loadVideoIndex,
  updateVideoIndexStore,
} from "../lib/caption-storage.ts";
import { App } from "./app.tsx";
import "../styles.css";

async function main() {
  const storage = idbCaptionStorage;
  storage.subscribe(updateVideoIndexStore);
  await loadVideoIndex(storage);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <CaptionStorageProvider value={storage}>
        <App />
      </CaptionStorageProvider>
    </StrictMode>,
  );
}

main();
