import { EllipsisVertical } from "lucide-react";
import { useTheme } from "../lib/theme.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { VideoCard } from "./video-card.tsx";

export function BookmarksPage({
  entries,
  onVideoClick,
}: {
  entries: VideoIndexEntry[];
  onVideoClick: (youtubeId: string) => void;
}) {
  const { theme, cycle, Icon } = useTheme();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Zamak</span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted">
            <EllipsisVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-36">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                cycle();
              }}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              <span className="capitalize">{theme}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-8">
          <h1 className="mb-6 text-2xl font-bold">Bookmarked Videos</h1>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookmarked videos yet. Open a YouTube video and create
              bookmarks to see them here.
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
      </main>
    </div>
  );
}
