import { useState } from "react";
import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { useStore } from "../lib/external-store.ts";
import { useVideoSync } from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import { bootstrapFixtures } from "./dev-fixtures.ts";

export function DevBookmarksPage() {
  const [entries] = useStore(videoIndexStore);
  const navigate = useNavigate();
  const sync = useVideoSync();
  const [bootstrapping, setBootstrapping] = useState(false);

  const onBootstrap = async () => {
    setBootstrapping(true);
    try {
      await bootstrapFixtures();
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
      sync={sync}
      actions={
        <button
          type="button"
          data-testid="bootstrap-fixtures"
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          disabled={bootstrapping}
          onClick={onBootstrap}
        >
          {bootstrapping ? "Bootstrapping..." : "Bootstrap fixtures"}
        </button>
      }
    />
  );
}
