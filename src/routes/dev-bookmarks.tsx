import { useSyncExternalStore } from "react";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { VIDEO_INDEX_EVENT } from "../lib/video-index.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";

const KEY = "zamak:video-index";

let cached: { raw: string | null; parsed: VideoIndexEntry[] } = {
  raw: null,
  parsed: [],
};

function getSnapshot(): VideoIndexEntry[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cached.raw) {
    try {
      cached = {
        raw,
        parsed: raw ? (JSON.parse(raw) as VideoIndexEntry[]) : [],
      };
    } catch {
      cached = { raw, parsed: [] };
    }
  }
  return cached.parsed;
}

function subscribe(callback: () => void) {
  window.addEventListener(VIDEO_INDEX_EVENT, callback);
  return () => window.removeEventListener(VIDEO_INDEX_EVENT, callback);
}

export function DevBookmarksPage() {
  const entries = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => window.open(`/dev/youtube/${id}`, "_blank")}
    />
  );
}
