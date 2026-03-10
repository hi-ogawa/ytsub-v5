import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import "../styles.css";

declare const chrome: {
  storage: {
    local: {
      get: (key: string, cb: (result: Record<string, unknown>) => void) => void;
    };
  };
  tabs: { create: (opts: { url: string }) => void };
};

function ExtensionBookmarksPage() {
  const [entries, setEntries] = useState<VideoIndexEntry[]>([]);

  useEffect(() => {
    chrome.storage.local.get("video-index", (result) => {
      setEntries((result["video-index"] as VideoIndexEntry[]) || []);
    });
  }, []);

  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(youtubeId) => {
        chrome.tabs.create({
          url: `https://www.youtube.com/watch?v=${youtubeId}`,
        });
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExtensionBookmarksPage />
  </StrictMode>,
);
