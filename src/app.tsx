import { useEffect, useState } from "react";
import { VideoList } from "./pages/video-list.tsx";
import { VideoViewer } from "./pages/video-viewer.tsx";

type Route = { page: "list" } | { page: "viewer"; videoId: number };

function parseHash(): Route {
  const match = window.location.hash.match(/^#\/videos\/(\d+)$/);
  if (match) return { page: "viewer", videoId: parseInt(match[1]) };
  return { page: "list" };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = r.page === "list" ? "#/" : `#/videos/${r.videoId}`;
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Nav bar */}
      <nav className="flex shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => navigate({ page: "list" })}
          className="text-lg font-bold tracking-tight text-gray-900 hover:text-blue-600"
        >
          ytsub
        </button>
        {route.page === "viewer" && (
          <button
            onClick={() => navigate({ page: "list" })}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Videos
          </button>
        )}
      </nav>

      {/* Page content */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {route.page === "list" ? (
          <VideoList
            onSelectVideo={(id) => navigate({ page: "viewer", videoId: id })}
          />
        ) : (
          <VideoViewer videoId={route.videoId} />
        )}
      </main>
    </div>
  );
}
