import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useStore } from "../lib/external-store.ts";
import { useVideoSync, type VideoSyncEntry } from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";

export function VideoListPage() {
  const [entries] = useStore(videoIndexStore);
  const navigate = useNavigate();
  const sync = useVideoSync();
  const queryClient = useQueryClient();
  const deleteMutation = useMutation(
    orpc.videos.deleteVideo.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.videos.listVideos.queryOptions({ input: {} }).queryKey,
        });
        sync.refetch();
      },
    }),
  );

  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/videos/${id}`)}
      sync={sync}
      titleRight={(entry) => (
        <div className="flex items-center gap-0.5">
          <DeleteDropdown entry={entry} deleteMutation={deleteMutation} />
        </div>
      )}
    />
  );
}

function DeleteDropdown({
  entry,
  deleteMutation,
}: {
  entry: VideoSyncEntry;
  deleteMutation: ReturnType<
    typeof useMutation<unknown, Error, { id: number }>
  >;
}) {
  // Can only delete if video exists on server (has serverId)
  if (!entry.serverId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="-mr-1.5 -mt-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <EllipsisVertical className="h-4 w-4" />
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
            if (
              window.confirm(
                `Delete "${entry.title}" from server? This will also delete its captions and bookmarks on the server.`,
              )
            ) {
              deleteMutation.mutate({ id: entry.serverId! });
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete from server
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
