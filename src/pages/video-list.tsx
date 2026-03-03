import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { orpc } from "../rpc.ts";

export function VideoList() {
  const { data: videos, isLoading } = useQuery(orpc.videos.list.queryOptions());

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">ytsub</h1>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !videos?.length ? (
        <p className="text-sm text-gray-500">
          No videos yet. Import one via the API.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {videos.map((video) => (
            <li key={video.id} className="py-4">
              <Link
                to={`/videos/${video.id}`}
                className="group flex items-start gap-4 hover:opacity-80"
              >
                <img
                  src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                  alt={video.title}
                  className="h-16 w-28 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium group-hover:underline">
                    {video.title}
                  </p>
                  {video.channelName && (
                    <p className="mt-1 text-sm text-gray-500">
                      {video.channelName}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {video.language1} / {video.language2}
                    {video.duration
                      ? ` · ${formatDuration(video.duration)}`
                      : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
