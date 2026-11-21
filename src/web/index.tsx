import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import { initCaptionStorage, loadVideoIndex } from "../lib/caption-storage.ts";
import { App } from "./app.tsx";
import "../styles.css";

async function main() {
  initCaptionStorage(idbCaptionStorage);
  await loadVideoIndex();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
