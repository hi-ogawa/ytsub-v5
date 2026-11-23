import {
  ArrowDownToLine,
  ArrowUpFromLine,
  EllipsisVertical,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { VideoIndexEntry } from "../lib/caption-storage.ts";
import { formatRelativeTime } from "../utils/relative-time.ts";
import { syncStateDisplay } from "./sync-state.tsx";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { VideoListEntry } from "./use-video-list-sync.ts";
import type { VideoListSync } from "./use-video-list-sync.ts";
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
  onDelete?: (entry: VideoListEntry) => void;
  sync?: VideoListSync;
  emptyState?: React.ReactNode;
}) {
  const displayEntries: VideoListEntry[] = sync?.isPending
    ? []
    : (sync?.entries ?? entries);
  const sorted = [...displayEntries].sort((a, b) =>
    b.editedAt.localeCompare(a.editedAt),
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
                  <span
                    data-testid="video-card-storage"
                    className="rounded bg-muted px-2 py-0.5"
                  >
                    {entry.bookmarkCount === undefined
                      ? "Not on this device"
                      : `${entry.bookmarkCount} bookmark${entry.bookmarkCount === 1 ? "" : "s"}`}
                  </span>
                  <EditTime time={entry.editedAt} />
                  {sync && entry.syncStatus && (
                    <span className="ml-auto">
                      <SyncBadge
                        status={entry.syncStatus}
                        localEditedAt={entry.editedAt}
                        serverEditedAt={entry.serverEditedAt}
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

function EditTime({ time }: { time: string }) {
  return (
    <time
      dateTime={time}
      title={`Edited ${new Date(time).toLocaleString()}`}
      data-testid="edited-at"
    >
      {formatRelativeTime(time)}
    </time>
  );
}

function CardMenu({
  entry,
  onDelete,
}: {
  entry: VideoListEntry;
  onDelete: () => void;
}) {
  // The menu sits inside the card's link. Stop its clicks from navigating only
  // after they bubble, because the trigger skips its toggle on a click that is
  // already default-prevented.
  return (
    <div
      className="contents"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="video-card-menu"
          className="-mr-1.5 -mt-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
        >
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
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
    </div>
  );
}

function SyncBadge({
  status,
  localEditedAt,
  serverEditedAt,
  syncing,
  onPull,
  onPush,
}: {
  status: NonNullable<VideoListEntry["syncStatus"]>;
  localEditedAt: string;
  serverEditedAt?: string;
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
    displayState === "empty"
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
        title={
          displayState === "pull" && serverEditedAt
            ? `${label}: server copy edited ${formatRelativeTime(serverEditedAt)}`
            : label
        }
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
            This device and the server both have changes. Choose which copy to
            keep.
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
              <span className="flex flex-col items-start">
                Upload local
                <span className="text-xs text-muted-foreground">
                  Edited <EditTime time={localEditedAt} />
                </span>
              </span>
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
              <span className="flex flex-col items-start">
                Download server
                {serverEditedAt && (
                  <span className="text-xs text-muted-foreground">
                    Edited <EditTime time={serverEditedAt} />
                  </span>
                )}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
