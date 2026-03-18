import {
  ArrowDownToLine,
  ArrowUpFromLine,
  EllipsisVertical,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { VideoSyncEntry, VideoSyncHandle } from "../lib/sync.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { syncStateDisplay } from "./sync-state.tsx";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";
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
  emptyState,
}: {
  entries: VideoIndexEntry[];
  videoHref: (youtubeId: string) => string;
  onDelete?: (entry: VideoSyncEntry) => void;
  sync?: VideoSyncHandle;
  emptyState?: React.ReactNode;
}) {
  const displayEntries: VideoSyncEntry[] = sync?.isPending
    ? []
    : (sync?.entries ?? entries);
  const sorted = [...displayEntries].sort((a, b) => b.updatedAt - a.updatedAt);

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
        (emptyState ?? (
          <p className="text-sm text-muted-foreground">
            No bookmarked videos yet. Open a YouTube video and create bookmarks
            to see them here.
          </p>
        ))
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
  const [conflictOpen, setConflictOpen] = useState(false);
  const displayState = syncing ? "syncing" : status;
  const { icon, label } = syncStateDisplay(displayState);
  const testAttrs = {
    "data-testid": "video-sync-badge",
    "data-sync-status": displayState,
  };

  if (
    displayState === "synced" ||
    displayState === "syncing" ||
    displayState === "unknown"
  ) {
    return (
      <span className="inline-flex p-1.5" title={label} {...testAttrs}>
        {icon}
      </span>
    );
  }

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (displayState === "conflict") {
      setConflictOpen(true);
    } else if (displayState === "push") {
      onPush();
    } else {
      onPull();
    }
  };

  return (
    <>
      <button
        type="button"
        title={label}
        className="rounded p-1.5 hover:bg-muted"
        onClick={onClick}
        {...testAttrs}
      >
        {icon}
      </button>
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogTitle>Sync conflict</DialogTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Both local and server have changes. Choose which version to keep.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded bg-muted px-4 py-2 text-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setConflictOpen(false);
                onPush();
              }}
            >
              <ArrowUpFromLine className="size-4" />
              Upload local
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded bg-muted px-4 py-2 text-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setConflictOpen(false);
                onPull();
              }}
            >
              <ArrowDownToLine className="size-4" />
              Download server
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
