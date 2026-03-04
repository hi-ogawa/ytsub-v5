import { useQuery } from "@tanstack/react-query";
import { orpc } from "./rpc.ts";

export function App() {
  const videos = useQuery(orpc.videos.listVideos.queryOptions({ input: {} }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">ytsub</h1>
      <p className="mt-2 text-sm text-gray-500">
        {videos.isLoading
          ? "connecting..."
          : videos.isSuccess
            ? `connected — ${videos.data.total} videos`
            : "server offline"}
      </p>
    </div>
  );
}
