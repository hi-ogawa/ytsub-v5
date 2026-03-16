import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { deleteSession } from "../lib/caption-session-db.ts";
import { useStore } from "../lib/external-store.ts";
import { useVideoSync, type VideoSyncEntry } from "../lib/sync.ts";
import { removeFromVideoIndex, videoIndexStore } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";

const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/zamak/gkonhebhbkfoeggebiipfbblfecdbabn";

function WebAppEmptyState() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>No bookmarked videos yet.</p>
      <p>
        Install the{" "}
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline"
        >
          Chrome extension
          <ExternalLink className="size-3" />
        </a>{" "}
        to bookmark vocabulary from YouTube videos, then sync them here.
      </p>
      <p className="text-sm">
        You can also import videos from the header menu.
      </p>
    </div>
  );
}

export function VideoListPage() {
  const [entries] = useStore(videoIndexStore);
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

  async function onDelete(entry: VideoSyncEntry) {
    if (entry.serverId) {
      deleteMutation.mutate({ id: entry.serverId });
    }
    removeFromVideoIndex(entry.youtubeId);
    await deleteSession(entry.youtubeId);
  }

  return (
    <BookmarksPage
      entries={entries}
      videoHref={(id) => `/videos/${id}`}
      onDelete={onDelete}
      sync={sync}
      emptyState={<WebAppEmptyState />}
    />
  );
}
