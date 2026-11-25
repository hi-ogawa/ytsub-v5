import { useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { BookmarksPage } from "../../components/bookmarks-page.tsx";
import type {
  VideoListEntry,
  VideoListSync,
} from "../../components/use-video-list-sync.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { SyncState, SyncStatus } from "../../lib/sync.ts";
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

const SYNC_STATES: SyncState[] = [
  "synced",
  "push",
  "pull",
  "conflict",
  "syncing",
  "checking",
  "error",
  "empty",
  "unauthenticated",
];

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
            serverError={searchParams.has("error")}
            videoHref={(youtubeId) =>
              getPageHref({ page: "watch", video: youtubeId })
            }
          />
        ) : (
          <WatchPreview
            storage={storage}
            youtubeId={searchParams.get("video") ?? previewVideoIds[0]}
            syncState={getSyncState(searchParams)}
            listHref={getPageHref({ page: "list" })}
          />
        )}
      </main>
    </div>
  );
}

function getSyncState(searchParams: URLSearchParams): SyncState {
  const value = searchParams.get("sync");
  return SYNC_STATES.find((state) => state === value) ?? "synced";
}

function ListPreview({
  serverError,
  videoHref,
}: {
  serverError: boolean;
  videoHref: (youtubeId: string) => string;
}) {
  const [entries, setEntries] = useState(createPreviewListEntries);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  // Shows the spinner for a moment, then the video as synced.
  function fakeSync(youtubeId: string) {
    setSyncing((ids) => new Set(ids).add(youtubeId));
    setTimeout(() => {
      setSyncing((ids) => {
        const next = new Set(ids);
        next.delete(youtubeId);
        return next;
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.youtubeId === youtubeId
            ? { ...entry, syncStatus: "synced" }
            : entry,
        ),
      );
    }, 1000);
  }

  // When the server fails, the app lists only this device's videos, without
  // sync badges.
  const displayEntries: VideoListEntry[] = serverError
    ? entries
        .filter((entry) => entry.bookmarkCount !== undefined)
        .map(({ syncStatus: _, ...entry }) => entry)
    : entries;

  const sync: VideoListSync = {
    authenticated: true,
    isPending: false,
    serverError: serverError
      ? new Error("Failed to fetch (preview)")
      : undefined,
    entries: displayEntries,
    syncing,
    onPull: async (youtubeId) => fakeSync(youtubeId),
    onPush: async (youtubeId) => fakeSync(youtubeId),
    refetch: async () => {},
  };

  return (
    <BookmarksPage
      entries={[]}
      videoHref={videoHref}
      onDelete={(deleted) =>
        setEntries((current) =>
          current.filter((entry) => entry.youtubeId !== deleted.youtubeId),
        )
      }
      sync={sync}
    />
  );
}

function WatchPreview({
  storage,
  youtubeId,
  syncState,
  listHref,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  syncState: SyncState;
  listHref: string;
}) {
  const navigate = useNavigate();
  const sync: SyncStatus = {
    state: syncState,
    onNavigate: () => navigate(listHref),
    onPush: () => {},
    onPull: () => {},
  };
  return (
    <VideoViewer
      key={youtubeId}
      storage={storage}
      youtubeId={youtubeId}
      useSync={() => sync}
    />
  );
}
