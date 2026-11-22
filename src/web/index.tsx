import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import {
  loadVideoIndex,
  updateVideoIndexStore,
} from "../lib/caption-storage.ts";
import { App } from "./app.tsx";
import "../styles.css";

async function main() {
  idbCaptionStorage.subscribe(updateVideoIndexStore);
  await loadVideoIndex(idbCaptionStorage);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
