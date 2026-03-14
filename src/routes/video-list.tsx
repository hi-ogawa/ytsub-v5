import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { deleteSession } from "../lib/caption-session-db.ts";
import { useStore } from "../lib/external-store.ts";
import { useVideoSync, type VideoSyncEntry } from "../lib/sync.ts";
import { removeFromVideoIndex, videoIndexStore } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";
import { bootstrapFixtures } from "./dev-fixtures.ts";

export function VideoListPage() {
  const [entries] = useStore(videoIndexStore);
  const navigate = useNavigate();
  const sync = useVideoSync();
  const [bootstrapping, setBootstrapping] = useState(false);
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

  const onBootstrap = async () => {
    setBootstrapping(true);
    try {
      await bootstrapFixtures();
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/videos/${id}`)}
      onDelete={onDelete}
      sync={sync}
      actions={
        <button
          type="button"
          data-testid="bootstrap-fixtures"
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          disabled={bootstrapping}
          onClick={onBootstrap}
        >
          {bootstrapping ? "Bootstrapping..." : "Bootstrap fixtures"}
        </button>
      }
    />
  );
}
