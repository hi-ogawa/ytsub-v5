import { QueryClientProvider } from "@tanstack/react-query";
import { EllipsisVertical, LogIn, LogOut } from "lucide-react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { BookmarksPage } from "../components/bookmarks-page.tsx";
import { LoginDialog } from "../components/login-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useStore } from "../lib/external-store.ts";
import { createAppQueryClient } from "../lib/query-client.ts";
import { useVideoSync } from "../lib/sync.ts";
import { useTheme } from "../lib/theme.ts";
import { videoIndexStore } from "../lib/video-index.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
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
      remove: (keys: string[], cb?: () => void) => void;
    };
  };
  tabs: { create: (opts: { url: string }) => void };
};

function getStorageValue(key: string): Promise<string | undefined> {
  return new Promise((resolve) =>
    chrome.storage.local.get([key], (r) =>
      resolve(r[key] as string | undefined),
    ),
  );
}

// Configure RPC to use extension server URL + bearer token auth
setRpcConfig({
  url: getServerUrl() + "/api",
  fetch: async (request) => {
    const token = await getStorageValue("session-token");
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

function getStorage(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

// Two-way bridge: chrome.storage.local <-> localStorage for video-index.
// Hydrate localStorage from chrome.storage.local before rendering, then keep
// them in sync so videoIndexStore (localStorage-backed) works on this origin.
const VIDEO_INDEX_KEY = "zamak:video-index";

let initialUsername: string | undefined;

async function bridgeChromeStorage() {
  // Hydrate: chrome.storage.local -> localStorage
  const result = await getStorage([VIDEO_INDEX_KEY, "username"]);
  const entries = result[VIDEO_INDEX_KEY];
  initialUsername = result["username"] as string | undefined;
  if (entries) {
    localStorage.setItem(VIDEO_INDEX_KEY, JSON.stringify(entries));
  }
  // Re-initialize videoIndexStore from the now-populated localStorage
  videoIndexStore.set(
    entries ? (entries as Parameters<typeof videoIndexStore.set>[0]) : [],
  );

  // localStorage -> chrome.storage.local (when videoIndexStore writes)
  window.addEventListener(`zamak:store:${VIDEO_INDEX_KEY}`, () => {
    const raw = localStorage.getItem(VIDEO_INDEX_KEY);
    if (raw) {
      chrome.storage.local.set({ [VIDEO_INDEX_KEY]: JSON.parse(raw) });
    }
  });
}

const queryClient = createAppQueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ExtensionBookmarksPage() {
  const [entries] = useStore(videoIndexStore);
  const [username, setUsername] = useState(initialUsername);
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoSync();
  const [showLogin, setShowLogin] = useState(false);

  const handleLogout = async () => {
    await orpc.auth.logout.call({});
    await new Promise<void>((resolve) =>
      chrome.storage.local.remove(["session-token", "username"], resolve),
    );
    setUsername(undefined);
    sync.refetch();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Zamak</span>
        <div className="flex items-center gap-1">
          {sync.authenticated && username && (
            <span
              data-testid="auth-username"
              className="text-xs text-muted-foreground"
            >
              {username}
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

// Hydrate localStorage from chrome.storage.local before rendering so that
// videoIndexStore (localStorage-backed) has the correct data on this origin.
bridgeChromeStorage().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ExtensionBookmarksPage />
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </StrictMode>,
  );
});
