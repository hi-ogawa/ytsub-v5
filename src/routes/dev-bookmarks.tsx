import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { useStore } from "../lib/external-store.ts";
import { videoIndexStore } from "../lib/video-index.ts";

export function DevBookmarksPage() {
  const entries = useStore(videoIndexStore);
  const navigate = useNavigate();
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
    />
  );
}
