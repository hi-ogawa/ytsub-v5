import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { getVideoIndex, VIDEO_INDEX_EVENT } from "../lib/video-index.ts";

export function DevBookmarksPage() {
  const [entries, setEntries] = useState(getVideoIndex);
  useEffect(() => {
    const handler = () => setEntries(getVideoIndex());
    window.addEventListener(VIDEO_INDEX_EVENT, handler);
    return () => window.removeEventListener(VIDEO_INDEX_EVENT, handler);
  }, []);

  const navigate = useNavigate();
  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
    />
  );
}
