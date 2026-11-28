import { useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { BookmarksPage } from "../../components/bookmarks-page.tsx";
import type { VideoListSync } from "../../components/use-video-list-sync.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { SyncStatus } from "../../lib/sync.ts";
import { AppHeader } from "../routes/root.tsx";
import { VideoViewer } from "../routes/video-viewer.tsx";
import {
  createPreviewListEntries,
  createPreviewStorage,
  previewVideoIds,
} from "./preview-fixtures.ts";

// The list and watch pages with fixture data and fake sync, for looking at the
// UI without logging in. Edits last until the page reloads. Keep tests off this
// page, so they run against what users run.

export async function loader() {
  return { storage: await createPreviewStorage() };
}

export function Component() {
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page") === "watch" ? "watch" : "list";
  const { storage } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  function getPageHref(params: Record<string, string>) {
    return `/_preview?${new URLSearchParams(params)}`;
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader homeHref="/_preview" storage={storage} authenticated={false} />
      <main className="flex-1 overflow-auto">
        {page === "list" ? (
          <ListPreview
            videoHref={(youtubeId) =>
              getPageHref({ page: "watch", video: youtubeId })
            }
          />
        ) : (
          <WatchPreview
            storage={storage}
            youtubeId={searchParams.get("video") ?? previewVideoIds[0]}
            listHref={getPageHref({ page: "list" })}
          />
        )}
      </main>
    </div>
  );
}

function ListPreview({
  videoHref,
}: {
  videoHref: (youtubeId: string) => string;
}) {
  const [entries, setEntries] = useState(createPreviewListEntries);

  const sync: VideoListSync = {
    authenticated: true,
    isPending: false,
    serverError: undefined,
    entries,
    syncing: new Set(),
    onPull: async () => {},
    onPush: async () => {},
    onDelete: async (deleted) =>
      setEntries((current) =>
        current.filter((entry) => entry.youtubeId !== deleted.youtubeId),
      ),
    refetch: async () => {},
  };

  return <BookmarksPage entries={[]} videoHref={videoHref} sync={sync} />;
}

function WatchPreview({
  storage,
  youtubeId,
  listHref,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  listHref: string;
}) {
  const navigate = useNavigate();
  const sync: SyncStatus = {
    state: "synced",
    onPush: () => {},
    onPull: () => {},
  };
  return (
    <VideoViewer
      key={youtubeId}
      storage={storage}
      youtubeId={youtubeId}
      useSync={() => sync}
      onOpenBookmarksPage={() => navigate(listHref)}
    />
  );
}
