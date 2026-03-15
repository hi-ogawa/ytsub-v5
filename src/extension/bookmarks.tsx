import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { EllipsisVertical, LogIn, LogOut } from "lucide-react";
import { StrictMode, useState } from "react";
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
import { orpc, setRpcConfig } from "../rpc.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { getServerUrl } from "./lib/server-url.ts";
import "../styles.css";

// Configure RPC to use extension server URL + bearer token auth
setRpcConfig({
  url: getServerUrl() + "/api",
  fetch: async (request) => {
    const token = await chromeStorage.get<string>("session-token");
    if (token) {
      const headers = new Headers(
        request instanceof Request ? request.headers : undefined,
      );
      headers.set("authorization", `Bearer ${token}`);
      request = new Request(request, { headers });
    }
    return fetch(request);
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ExtensionBookmarksPage() {
  // chrome.storage reads resolve near-instantly (local I/O), so they settle
  // before BookmarksPage's own auth-check query finishes — no layout flash.
  const { data: entries = [] } = useQuery({
    ...chromeStorage.queryOptions<VideoIndexEntry[]>("video-index"),
    placeholderData: [],
  });
  const usernameQuery = useQuery(
    chromeStorage.queryOptions<string>("username"),
  );
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoSync();
  const [showLogin, setShowLogin] = useState(false);

  const handleLogout = async () => {
    await orpc.auth.logout.call({});
    await chromeStorage.remove(["session-token", "username"]);
    usernameQuery.refetch();
    sync.refetch();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Zamak</span>
        <div className="flex items-center gap-1">
          {sync.authenticated && usernameQuery.data && (
            <span
              data-testid="auth-username"
              className="text-xs text-muted-foreground"
            >
              {usernameQuery.data}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="header-menu"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            >
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
                <DropdownMenuItem
                  data-testid="sign-out"
                  onSelect={handleLogout}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  data-testid="sign-in"
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
          await chromeStorage.set({
            "session-token": token,
            username: input.username,
          });
          usernameQuery.refetch();
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
