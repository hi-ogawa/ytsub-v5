import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  EllipsisVertical,
  Loader2,
  Trash2,
} from "lucide-react";
import type { VideoSyncEntry, VideoSyncHandle } from "../lib/sync.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { VideoCard } from "./video-card.tsx";

export function BookmarksPage({
  entries,
  videoHref,
  onDelete,
  sync,
}: {
  entries: VideoIndexEntry[];
  videoHref: (youtubeId: string) => string;
  onDelete?: (entry: VideoSyncEntry) => void;
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
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <div className="flex-1" />
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
              href={videoHref(entry.youtubeId)}
              title={entry.title}
              channelName={entry.channelName}
              titleRight={
                onDelete && (
                  <CardMenu entry={entry} onDelete={() => onDelete(entry)} />
                )
              }
              badge={
                <>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono">
                    {entry.bookmarkCount} bookmark
                    {entry.bookmarkCount === 1 ? "" : "s"}
                  </span>
                  {sync && entry.syncStatus && (
                    <span className="ml-auto">
                      <SyncBadge
                        status={entry.syncStatus}
                        syncing={sync.syncing.has(entry.youtubeId)}
                        onPull={() => sync.onPull(entry.youtubeId)}
                        onPush={() => sync.onPush(entry.youtubeId)}
                      />
                    </span>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardMenu({
  entry,
  onDelete,
}: {
  entry: VideoSyncEntry;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="video-card-menu"
        className="-mr-1.5 -mt-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            if (window.confirm(`Delete "${entry.title}"?`)) {
              onDelete();
            }
          }}
        >
          <Trash2 className="mr-2 size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <span className="inline-flex p-1.5" title="Syncing..." {...testAttrs}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </span>
    );
  }
  switch (status) {
    case "synced":
      return (
        <span className="inline-flex p-1.5" title="Synced" {...testAttrs}>
          <CheckCircle2 className="size-4 text-green-500" />
        </span>
      );
    case "pull":
      return (
        <button
          type="button"
          title="Pull server changes"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPull();
          }}
          {...testAttrs}
        >
          <ArrowDownToLine className="size-4" />
        </button>
      );
    case "push":
      return (
        <button
          type="button"
          title="Push local changes to server"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPush();
          }}
          {...testAttrs}
        >
          <ArrowUpFromLine className="size-4" />
        </button>
      );
    case "conflict":
      return (
        <button
          type="button"
          title="Both sides changed — click to resolve"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const choice = window.prompt(
              "Both local and server have changes.\nType 'push' to keep local, 'pull' to keep server:",
            );
            if (choice === "push") onPush();
            else if (choice === "pull") onPull();
          }}
          {...testAttrs}
        >
          <AlertTriangle className="size-4 text-yellow-500" />
        </button>
      );
  }
}
