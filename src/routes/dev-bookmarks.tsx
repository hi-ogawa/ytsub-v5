import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { useStore } from "../lib/external-store.ts";
import { useBookmarksSync } from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";

export function DevBookmarksPage() {
  const [entries] = useStore(videoIndexStore);
  const navigate = useNavigate();
  const sync = useBookmarksSync();
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
      sync={sync}
    />
  );
}
