import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";
import { BookmarksPage } from "../../components/bookmarks-page.tsx";
import type {
  VideoListEntry,
  VideoListSync,
} from "../../components/use-video-list-sync.ts";
import type { SyncState, SyncStatus } from "../../lib/sync.ts";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const page = searchParams.get("page") === "watch" ? "watch" : "list";
  const theme = getTheme(searchParams);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function setParam(name: string, value?: string) {
    setSearchParams(
      (params) => {
        if (value === undefined) {
          params.delete(name);
        } else {
          params.set(name, value);
        }
        return params;
      },
      { replace: true },
    );
  }

  function getPageHref(params: Record<string, string>) {
    const next = new URLSearchParams({ ...params, theme });
    return `/_preview?${next}`;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-9 flex-none items-center gap-2 border-b px-3 text-sm">
        <span className="font-semibold">Preview</span>
        <nav className="flex rounded-md border border-border p-0.5">
          {(["list", "watch"] as const).map((name) => (
            <Link
              key={name}
              to={getPageHref({ page: name })}
              aria-current={page === name ? "page" : undefined}
              className="rounded px-2 py-0.5 capitalize text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
            >
              {name}
            </Link>
          ))}
        </nav>
        {page === "list" ? (
          <label className="flex items-center gap-1 text-muted-foreground">
            <input
              type="checkbox"
              checked={searchParams.has("error")}
              onChange={(event) =>
                setParam("error", event.target.checked ? "1" : undefined)
              }
            />
            Server error
          </label>
        ) : (
          <select
            aria-label="Sync state"
            className="rounded border bg-background px-1 py-0.5"
            value={getSyncState(searchParams)}
            onChange={(event) => setParam("sync", event.target.value)}
          >
            {SYNC_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          type="button"
          title="Toggle theme"
          aria-label="Toggle theme"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => setParam("theme", theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </button>
      </header>
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
            youtubeId={searchParams.get("video") ?? previewVideoIds[0]}
            syncState={getSyncState(searchParams)}
            listHref={getPageHref({ page: "list" })}
          />
        )}
      </main>
    </div>
  );
}

// Without `?theme=`, follow the system like the app's default.
function getTheme(searchParams: URLSearchParams): "light" | "dark" {
  const value = searchParams.get("theme");
  if (value === "light" || value === "dark") {
    return value;
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  youtubeId,
  syncState,
  listHref,
}: {
  youtubeId: string;
  syncState: SyncState;
  listHref: string;
}) {
  const { storage } = useLoaderData() as Awaited<ReturnType<typeof loader>>;
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
