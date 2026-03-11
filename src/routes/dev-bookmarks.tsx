import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { useLocalStorage } from "../lib/use-local-storage.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";

export function DevBookmarksPage() {
  const [entries] = useLocalStorage<VideoIndexEntry[]>("zamak:video-index", []);

  const navigate = useNavigate();
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
    />
  );
}
