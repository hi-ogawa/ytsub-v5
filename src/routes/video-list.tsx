import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { deleteSession } from "../lib/caption-session-db.ts";
import { useStore } from "../lib/external-store.ts";
import { useVideoSync, type VideoSyncEntry } from "../lib/sync.ts";
import { removeFromVideoIndex, videoIndexStore } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";

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
    />
  );
}
