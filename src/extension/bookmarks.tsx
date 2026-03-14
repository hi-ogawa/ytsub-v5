import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EllipsisVertical } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useVideoSync } from "../lib/sync.ts";
import { useTheme } from "../lib/theme.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import "../styles.css";

declare const chrome: {
  storage: {
    local: {
      get: (key: string, cb: (result: Record<string, unknown>) => void) => void;
    };
  };
  tabs: { create: (opts: { url: string }) => void };
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ExtensionBookmarksPage() {
  const [entries, setEntries] = useState<VideoIndexEntry[]>([]);
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoSync();

  useEffect(() => {
    chrome.storage.local.get("video-index", (result) => {
      setEntries((result["video-index"] as VideoIndexEntry[]) || []);
    });
  }, []);

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
        <BookmarksPage
          entries={entries}
          onVideoClick={(youtubeId) => {
            chrome.tabs.create({
              url: `https://www.youtube.com/watch?v=${youtubeId}`,
            });
          }}
          sync={sync}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ExtensionBookmarksPage />
    </QueryClientProvider>
  </StrictMode>,
);
