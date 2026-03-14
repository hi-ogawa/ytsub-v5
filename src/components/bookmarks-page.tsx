import {
  ArrowDownToLine,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
} from "lucide-react";
import type { BookmarkSyncEntry, BookmarksSyncHandle } from "../lib/sync.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VideoCard } from "./video-card.tsx";

export function BookmarksPage({
  entries,
  onVideoClick,
  sync,
}: {
  entries: VideoIndexEntry[];
  onVideoClick: (youtubeId: string) => void;
  sync?: BookmarksSyncHandle;
}) {
  const displayEntries: BookmarkSyncEntry[] = sync
    ? sync.entries
    : entries.map((e) => ({ ...e, syncStatus: "local-only" as const }));

  const sorted = [...displayEntries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Bookmarked Videos</h1>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bookmarked videos yet. Open a YouTube video and create bookmarks to
          see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((entry) => (
            <VideoCard
              key={entry.youtubeId}
              youtubeId={entry.youtubeId}
              href={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
              title={entry.title}
              channelName={entry.channelName}
              titleRight={
                sync ? (
                  <SyncBadge
                    status={entry.syncStatus}
                    pulling={sync.pulling.has(entry.youtubeId)}
                    onPull={() => sync.onPull(entry.youtubeId)}
                  />
                ) : undefined
              }
              badge={
                <span className="rounded bg-muted px-2 py-0.5 font-mono">
                  {entry.bookmarkCount} bookmark
                  {entry.bookmarkCount === 1 ? "" : "s"}
                </span>
              }
              onClick={(e) => {
                e.preventDefault();
                onVideoClick(entry.youtubeId);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SyncBadge({
  status,
  pulling,
  onPull,
}: {
  status: BookmarkSyncEntry["syncStatus"];
  pulling: boolean;
  onPull: () => void;
}) {
  if (pulling) {
    return (
      <span title="Pulling from server...">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </span>
    );
  }
  switch (status) {
    case "synced":
      return (
        <span title="Synced">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </span>
      );
    case "server-only":
    case "pull":
      return (
        <button
          type="button"
          title={
            status === "server-only"
              ? "Server only — pull to local"
              : "Pull server changes"
          }
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPull();
          }}
        >
          <ArrowDownToLine className="h-4 w-4" />
        </button>
      );
    case "push":
      return (
        <span title="Local changes not pushed">
          <Cloud className="h-4 w-4 text-muted-foreground" />
        </span>
      );
    case "local-only":
      return (
        <span title="Local only">
          <CloudOff className="h-4 w-4 text-muted-foreground" />
        </span>
      );
  }
}
