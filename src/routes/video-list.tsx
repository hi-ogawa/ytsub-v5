import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { orpc } from "../rpc.ts";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function VideoListPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(
    orpc.videos.listVideos.queryOptions({ input: {} }),
  );
  const deleteMutation = useMutation(
    orpc.videos.deleteVideo.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: orpc.videos.listVideos.queryOptions({ input: {} }).queryKey,
        }),
    }),
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-1 text-2xl font-bold">Videos</h1>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-500">Failed to load videos.</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-gray-500">{data.total} videos</p>
          {data.items.length === 0 ? (
            <p className="text-sm text-gray-400">No videos yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((video) => (
                <Link
                  key={video.id}
                  to={`/videos/${video.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h2 className="mb-1 line-clamp-2 font-semibold leading-snug">
                    {video.title}
                  </h2>
                  <p className="mb-3 truncate text-sm text-gray-500">
                    {video.channelName || "Unknown channel"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-mono">
                      {video.language1} / {video.language2}
                    </span>
                    <span>{formatDuration(video.duration)}</span>
                    <span className="ml-auto">
                      {formatDate(video.createdAt)}
                    </span>
                    <button
                      className="ml-1 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (
                          window.confirm(
                            `Delete "${video.title}"? This will also delete its captions and bookmarks.`,
                          )
                        ) {
                          deleteMutation.mutate({ id: video.id });
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
