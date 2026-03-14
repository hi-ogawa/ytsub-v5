import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { useStore } from "../lib/external-store.ts";
import {
  type BookmarkSyncEntry,
  type BookmarksSyncHandle,
  computeSyncState,
  pullServerSession,
} from "../lib/sync.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";

export function DevBookmarksPage() {
  const [entries] = useStore(videoIndexStore);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.listVideos.queryOptions({ input: { limit: 200 } }),
    enabled: authenticated,
  });

  const [pulling, setPulling] = useState<Set<string>>(new Set());

  const pullMutation = useMutation({
    mutationFn: async (youtubeId: string) => {
      setPulling((s) => new Set(s).add(youtubeId));
      try {
        const data = await queryClient.fetchQuery(
          orpc.videos.getFullSession.queryOptions({ input: { youtubeId } }),
        );
        if (!data) throw new Error("Video not found on server");
        await pullServerSession(data);
      } finally {
        setPulling((s) => {
          const next = new Set(s);
          next.delete(youtubeId);
          return next;
        });
      }
    },
    onSuccess: () => {
      serverQuery.refetch();
    },
  });

  const syncEntries = useMemo((): BookmarkSyncEntry[] => {
    const serverVideos = serverQuery.data?.items ?? [];
    const merged = new Map<string, BookmarkSyncEntry>();

    for (const local of entries) {
      const server = serverVideos.find((v) => v.youtubeId === local.youtubeId);
      const status = computeSyncState({
        localUpdatedAt: local.updatedAt,
        syncedAt: local.syncedAt,
        serverUpdatedAt: server?.updatedAt ?? undefined,
      });
      merged.set(local.youtubeId, {
        youtubeId: local.youtubeId,
        title: local.title,
        channelName: local.channelName,
        bookmarkCount: local.bookmarkCount,
        updatedAt: local.updatedAt,
        syncStatus:
          status === "synced" || status === "push" || status === "pull"
            ? status
            : status === "conflict"
              ? "push"
              : "local-only",
      });
    }

    for (const server of serverVideos) {
      if (!merged.has(server.youtubeId)) {
        merged.set(server.youtubeId, {
          youtubeId: server.youtubeId,
          title: server.title,
          channelName: server.channelName,
          bookmarkCount: 0,
          updatedAt: server.updatedAt,
          syncStatus: "server-only",
        });
      }
    }

    return Array.from(merged.values());
  }, [entries, serverQuery.data]);

  const sync: BookmarksSyncHandle | undefined = authenticated
    ? {
        entries: syncEntries,
        pulling,
        onPull: (youtubeId) => pullMutation.mutate(youtubeId),
      }
    : undefined;

  return (
    <BookmarksPage
      entries={entries}
      onVideoClick={(id) => navigate(`/dev/youtube/${id}`)}
      sync={sync}
    />
  );
}
