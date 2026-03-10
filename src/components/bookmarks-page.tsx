import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VideoCard } from "./video-card.tsx";

export function BookmarksPage({
  entries,
  onVideoClick,
}: {
  entries: VideoIndexEntry[];
  onVideoClick: (youtubeId: string) => void;
}) {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Bookmarked Videos</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bookmarked videos yet. Open a YouTube video and create bookmarks to
          see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...entries]
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            )
            .map((entry) => (
              <VideoCard
                key={entry.youtubeId}
                youtubeId={entry.youtubeId}
                href={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
                title={entry.title}
                channelName={entry.channelName}
                badge={
                  <span className="rounded bg-muted px-2 py-0.5 font-mono">
                    {entry.bookmarkCount} bookmark
                    {entry.bookmarkCount === 1 ? "" : "s"}
                  </span>
                }
                onClick={(e) => {
                  e.preventDefault();
                  onVideoClick(entry.youtubeId);
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
}
