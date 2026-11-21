import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { loadVideoIndex } from "./lib/caption-storage.ts";
import "./styles.css";

async function main() {
  await loadVideoIndex();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
