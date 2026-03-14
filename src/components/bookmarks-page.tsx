import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { VideoSyncEntry, VideoSyncHandle } from "../lib/sync.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VideoCard } from "./video-card.tsx";

export function BookmarksPage({
  entries,
  onVideoClick,
  sync,
}: {
  entries: VideoIndexEntry[];
  onVideoClick: (youtubeId: string) => void;
  sync?: VideoSyncHandle;
}) {
  const displayEntries: VideoSyncEntry[] = sync?.isPending
    ? []
    : (sync?.entries ?? entries);
  const sorted = [...displayEntries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-2xl font-bold">Bookmarked Videos</h1>
        {sync?.isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {sorted.length === 0 && !sync?.isPending ? (
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
                sync && entry.syncStatus ? (
                  <SyncBadge
                    status={entry.syncStatus}
                    syncing={sync.syncing.has(entry.youtubeId)}
                    onPull={() => sync.onPull(entry.youtubeId)}
                    onPush={() => sync.onPush(entry.youtubeId)}
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
  syncing,
  onPull,
  onPush,
}: {
  status: NonNullable<VideoSyncEntry["syncStatus"]>;
  syncing: boolean;
  onPull: () => void;
  onPush: () => void;
}) {
  const testAttrs = {
    "data-testid": "video-sync-badge",
    "data-sync-status": syncing ? "syncing" : status,
  };

  if (syncing) {
    return (
      <span title="Syncing..." {...testAttrs}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </span>
    );
  }
  switch (status) {
    case "synced":
      return (
        <span title="Synced" {...testAttrs}>
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
          {...testAttrs}
        >
          <ArrowDownToLine className="h-4 w-4" />
        </button>
      );
    case "push":
    case "local-only":
      return (
        <button
          type="button"
          title={
            status === "local-only"
              ? "Local only — push to server"
              : "Push local changes to server"
          }
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPush();
          }}
          {...testAttrs}
        >
          <ArrowUpFromLine className="h-4 w-4" />
        </button>
      );
  }
}
