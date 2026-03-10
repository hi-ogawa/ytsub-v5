import { useSyncExternalStore } from "react";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { getVideoIndex, VIDEO_INDEX_EVENT } from "../lib/video-index.ts";

function subscribeVideoIndex(callback: () => void) {
  window.addEventListener(VIDEO_INDEX_EVENT, callback);
  return () => window.removeEventListener(VIDEO_INDEX_EVENT, callback);
}

export function DevBookmarksPage() {
  const entries = useSyncExternalStore(subscribeVideoIndex, getVideoIndex);
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => window.open(`/dev/youtube/${id}`, "_blank")}
    />
  );
}
