import type { VideoIndexEntry } from "../lib/video-index.ts";

export function BookmarksPage({
  entries,
  onVideoClick,
}: {
  entries: VideoIndexEntry[];
  onVideoClick: (youtubeId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-[13px] text-neutral-500">
        No bookmarked videos yet.
        <br />
        Open a YouTube video and create bookmarks to see them here.
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="flex flex-col">
      {sorted.map((entry) => (
        <a
          key={entry.youtubeId}
          href={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
          className="flex gap-3 border-b border-neutral-900 px-4 py-2.5 text-inherit no-underline hover:bg-neutral-900"
          onClick={(e) => {
            e.preventDefault();
            onVideoClick(entry.youtubeId);
          }}
        >
          <img
            className="aspect-video w-[100px] min-w-[100px] rounded bg-neutral-800 object-cover"
            src={`https://img.youtube.com/vi/${entry.youtubeId}/mqdefault.jpg`}
            alt=""
          />
          <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
            <div className="line-clamp-2 text-[13px] font-medium leading-tight">
              {entry.title}
            </div>
            <div className="truncate text-xs text-neutral-500">
              {entry.channelName || "Unknown channel"}
            </div>
            <div className="mt-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span className="rounded bg-neutral-800 px-1.5 py-px font-mono">
                {entry.bookmarkCount} bookmark
                {entry.bookmarkCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
