import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EllipsisVertical, LogIn, LogOut } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { LoginDialog } from "../components/login-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useVideoSync } from "../lib/sync.ts";
import { useTheme } from "../lib/theme.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { orpc } from "../rpc.ts";
import { getServerUrl } from "./server-url.ts";
import "../styles.css";

declare const chrome: {
  storage: {
    local: {
      get: (
        keys: string | string[],
        cb: (result: Record<string, unknown>) => void,
      ) => void;
      set: (items: Record<string, unknown>) => void;
      remove: (keys: string[]) => void;
    };
  };
  tabs: { create: (opts: { url: string }) => void };
};

function getStorage(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ExtensionBookmarksPage() {
  const [entries, setEntries] = useState<VideoIndexEntry[]>([]);
  const [username, setUsername] = useState<string>();
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoSync();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    getStorage(["video-index", "username"]).then((result) => {
      setEntries((result["video-index"] as VideoIndexEntry[]) || []);
      setUsername(result["username"] as string | undefined);
    });
  }, []);

  const handleLogout = () => {
    chrome.storage.local.remove(["session-token", "username"]);
    setUsername(undefined);
    sync.refetch();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Zamak</span>
        <div className="flex items-center gap-1">
          {sync.authenticated && username && (
            <span className="text-xs text-muted-foreground">{username}</span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted">
              <EllipsisVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
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
              <div className="my-1 h-px bg-border" />
              {sync.authenticated ? (
                <DropdownMenuItem onSelect={handleLogout} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setShowLogin(true)}
                  className="gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <LoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        onLogin={async (input) => {
          const { token } = await orpc.auth.login.call(input);
          chrome.storage.local.set({
            "session-token": token,
            username: input.username,
          });
          setUsername(input.username);
          sync.refetch();
        }}
        signUpUrl={`${getServerUrl()}/register`}
      />
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
