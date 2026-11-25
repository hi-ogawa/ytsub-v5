import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import { videoIndexStore } from "../lib/caption-storage.ts";
import { App } from "./app.tsx";
import { recordPageLoad } from "./launch-diagnostics.tsx";
import "../styles.css";

async function main() {
  recordPageLoad();
  await videoIndexStore.connect(idbCaptionStorage);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App storage={idbCaptionStorage} />
    </StrictMode>,
  );
}

main();
