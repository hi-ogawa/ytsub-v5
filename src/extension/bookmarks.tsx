import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  EllipsisVertical,
  ExternalLink,
  LogIn,
  LogOut,
  Settings,
} from "lucide-react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { LoginDialog } from "../components/login-dialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useStore } from "../lib/external-store.ts";
import { createAppQueryClient } from "../lib/query-client.ts";
import { type VideoSyncActions, useVideoSync } from "../lib/sync.ts";
import { useTheme } from "../lib/theme.ts";
import {
  VIDEO_INDEX_KEY,
  type VideoIndexEntry,
  updateVideoIndex,
  videoIndexStore,
} from "../lib/video-index.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import type { bgRpcHandlers } from "./background.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { createRpc } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";
import "../styles.css";

declare const __DEV_EXT__: boolean;

const bgRpc = createRpc<typeof bgRpcHandlers>({ direct: true });

const extensionSyncActions: VideoSyncActions = {
  async pushSession(youtubeId) {
    await bgRpc.pushSession({ youtubeId });
  },
  async pullSession(youtubeId) {
    const result = await bgRpc.pullSession({ youtubeId });
    updateVideoIndex(
      youtubeId,
      result.title,
      result.channelName,
      result.bookmarkCount,
    );
  },
};

const SERVER_PRESETS = [
  { label: "Production", url: "https://zamak.hiro18181.workers.dev" },
  { label: "Local", url: "http://localhost:5173" },
];

function AdvancedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState(serverUrl);

  const save = async (value: string) => {
    if (!value) {
      await chromeStorage.remove(["serverUrl"]);
    } else {
      await chromeStorage.set({ serverUrl: value });
    }
    chrome.runtime.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Advanced</DialogTitle>
        <div className="space-y-3">
          <label className="block text-sm font-medium">Server URL</label>
          <div className="flex gap-1.5">
            {SERVER_PRESETS.map((p) => (
              <button
                key={p.url}
                type="button"
                onClick={() => setUrl(p.url)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  url === p.url
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => save(url)}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save & reload
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const queryClient = createAppQueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ExtensionBookmarksPage() {
  const [entries] = useStore(videoIndexStore);
  const usernameQuery = useQuery(
    chromeStorage.queryOptions<string>("username"),
  );
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoSync(extensionSyncActions);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleLogout = async () => {
    await orpc.auth.logout.call({});
    await chromeStorage.remove(["session-token", "username"]);
    usernameQuery.refetch();
    sync.refetch();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          Zamak
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium uppercase leading-none text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            ext
          </span>
        </span>
        <div className="flex items-center gap-1">
          {sync.authenticated ? (
            usernameQuery.data && (
              <span
                data-testid="auth-username"
                className="text-xs text-muted-foreground"
              >
                {usernameQuery.data}
              </span>
            )
          ) : (
            <button
              type="button"
              data-testid="sign-in"
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <LogIn className="size-3" />
              Sign in
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="header-menu"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            >
              <EllipsisVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  cycle();
                }}
                className="gap-2"
              >
                <Icon className="size-4" />
                <span className="capitalize">{theme}</span>
              </DropdownMenuItem>
              {__DEV_EXT__ && (
                <DropdownMenuItem
                  onSelect={() => setShowAdvanced(true)}
                  className="gap-2"
                >
                  <Settings className="size-4" />
                  Advanced
                </DropdownMenuItem>
              )}
              {sync.authenticated && (
                <DropdownMenuItem
                  onSelect={() =>
                    window.open(serverUrl, "_blank", "noopener,noreferrer")
                  }
                  className="gap-2"
                >
                  <ExternalLink className="size-4" />
                  Open web app
                </DropdownMenuItem>
              )}
              {sync.authenticated && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <DropdownMenuItem
                    data-testid="sign-out"
                    onSelect={handleLogout}
                    className="gap-2"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {__DEV_EXT__ && (
        <AdvancedDialog open={showAdvanced} onOpenChange={setShowAdvanced} />
      )}
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
        signUpUrl={new URL("/register", serverUrl).href}
      />
      <main className="flex-1 overflow-auto">
        <BookmarksPage
          entries={entries}
          videoHref={(id) => `https://www.youtube.com/watch?v=${id}`}
          sync={sync}
          emptyState={
            <p className="text-sm text-muted-foreground">
              No bookmarked videos yet. Open a YouTube video and create
              bookmarks to see them here.
            </p>
          }
        />
      </main>
    </div>
  );
}

let serverUrl = "";

async function main() {
  serverUrl = await getServerUrl();

  // Configure RPC to use extension server URL + bearer token auth
  setRpcConfig({
    url: async () => new URL("/api", serverUrl),
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

  // Two-way bridge: chrome.storage.local <-> localStorage for video-index.
  // Hydrate localStorage from chrome.storage.local before rendering, then keep
  // them in sync so videoIndexStore (localStorage-backed) works on this origin.
  const entries = await chromeStorage.get<VideoIndexEntry[]>(VIDEO_INDEX_KEY);
  videoIndexStore.set(entries ?? []);

  // Sync back to chrome.storage.local when videoIndexStore writes
  window.addEventListener(`zamak:store:${VIDEO_INDEX_KEY}`, () => {
    chromeStorage.set({ [VIDEO_INDEX_KEY]: videoIndexStore.get() });
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ExtensionBookmarksPage />
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

main();
