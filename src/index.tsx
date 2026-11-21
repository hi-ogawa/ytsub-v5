import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { captionStorage, loadVideoIndex } from "./lib/caption-storage.ts";
import "./styles.css";

// The index lived in localStorage before it moved into IndexedDB, next to the
// sessions. The localStorage copy stays for a downgrade.
const LEGACY_INDEX_KEY = "zamak:video-index";

async function main() {
  await captionStorage.importLegacy("local-storage-index", {
    index: JSON.parse(localStorage.getItem(LEGACY_INDEX_KEY) ?? "[]"),
    sessions: [],
  });
  await loadVideoIndex();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
