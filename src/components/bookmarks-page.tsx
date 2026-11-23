import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bookmark,
  EllipsisVertical,
  LayoutGrid,
  List,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { VideoIndexEntry } from "../lib/caption-storage.ts";
import {
  type VideoListLayout,
  videoListPreferences,
} from "../lib/video-list-preferences.ts";
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
  const [savedLayout, setLayout] = videoListPreferences.useValue("layout");
  // Below the width where the grid gets a second column, a card fills the
  // screen, so the list is the better start
  const layout =
    savedLayout ??
    (window.matchMedia("(min-width: 768px)").matches ? "grid" : "list");

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div
        className={`${layout === "list" ? "mb-2" : "mb-6"} flex items-center gap-2`}
      >
        <h1 className="text-2xl font-bold">Bookmarked Videos</h1>
        {sync?.isPending && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <div className="flex-1" />
        <LayoutSwitch layout={layout} onChange={setLayout} />
      </div>
      {sync?.serverError && (
        <ServerErrorNotice message={sync.serverError.message} />
      )}
      {sorted.length === 0 && !sync?.isPending ? (
        (emptyState ?? (
          <p className="text-sm text-muted-foreground">
            No bookmarked videos yet. Open a YouTube video and create bookmarks
            to see them here.
          </p>
        ))
      ) : (
        <div
          className={
            layout === "list"
              ? "divide-y divide-border"
              : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          }
        >
          {sorted.map((entry) => (
            <VideoCard
              key={entry.youtubeId}
              layout={layout}
              youtubeId={entry.youtubeId}
              href={videoHref(entry.youtubeId)}
              title={entry.title}
              channelName={entry.channelName}
              titleRight={
                onDelete && (
                  <CardMenu entry={entry} onDelete={() => onDelete(entry)} />
                )
              }
              bookmarkCount={<BookmarkCount count={entry.bookmarkCount} />}
              editTime={<EditTime time={entry.editedAt} />}
              syncBadge={
                sync &&
                entry.syncStatus && (
                  <SyncBadge
                    status={entry.syncStatus}
                    localEditedAt={entry.editedAt}
                    serverEditedAt={entry.serverEditedAt}
                    syncing={sync.syncing.has(entry.youtubeId)}
                    onPull={() => sync.onPull(entry.youtubeId)}
                    onPush={() => sync.onPush(entry.youtubeId)}
                  />
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-md border border-destructive/50 px-3 py-2 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Couldn't load videos from the server</p>
        <p className="break-words text-muted-foreground">{message}</p>
        <p className="text-muted-foreground">
          Showing the videos on this device.
        </p>
      </div>
    </div>
  );
}

function LayoutSwitch({
  layout,
  onChange,
}: {
  layout: VideoListLayout;
  onChange: (layout: VideoListLayout) => void;
}) {
  const options = [
    { value: "grid", label: "Grid", icon: <LayoutGrid className="size-4" /> },
    { value: "list", label: "List", icon: <List className="size-4" /> },
  ] as const;
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={layout === option.value}
          className={`rounded p-1.5 ${layout === option.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function BookmarkCount({ count }: { count?: number }) {
  const label =
    count === undefined
      ? "Not on this device"
      : `${count} bookmark${count === 1 ? "" : "s"}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="flex items-center gap-0.5"
    >
      <Bookmark className="size-3 -translate-y-px" />
      {count ?? "–"}
    </span>
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="video-card-menu"
        className="-mr-1.5 -mt-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
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

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
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
              onClick={(event) => {
                event.stopPropagation();
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
              onClick={(event) => {
                event.stopPropagation();
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
