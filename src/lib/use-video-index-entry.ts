import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CaptionStorage } from "./caption-storage.ts";

export function useVideoIndexEntry({
  storage,
  youtubeId,
}: {
  storage: CaptionStorage;
  youtubeId: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["video-index-entry", youtubeId],
    // React Query rejects undefined data.
    queryFn: async () => (await storage.getVideoIndexEntry(youtubeId)) ?? null,
  });

  useEffect(
    () =>
      storage.subscribe((notice) => {
        if (notice.type === "videoIndex") {
          queryClient.invalidateQueries({
            queryKey: ["video-index-entry", youtubeId],
          });
        }
      }),
    [storage, queryClient, youtubeId],
  );

  return query;
}
