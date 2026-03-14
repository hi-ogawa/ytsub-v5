import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EllipsisVertical, LogIn, LogOut } from "lucide-react";
import { type SubmitEvent, StrictMode, useEffect, useState } from "react";
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

declare const __SERVER_URL__: string;

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
    setShowLogin(false);
    sync.refetch();
  };

  const handleLoginSuccess = (name: string) => {
    setUsername(name);
    setShowLogin(false);
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
      {showLogin && !sync.authenticated && (
        <LoginBanner
          onSuccess={handleLoginSuccess}
          onCancel={() => setShowLogin(false)}
        />
      )}
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

function LoginBanner({
  onSuccess,
  onCancel,
}: {
  onSuccess: (username: string) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = new FormData(e.currentTarget);
    const username = form.get("username") as string;
    const password = form.get("password") as string;

    try {
      const res = await fetch(`${__SERVER_URL__}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { username, password } }),
      });

      if (!res.ok) {
        setError("Invalid username or password");
        setPending(false);
        return;
      }

      const data = (await res.json()) as { json: { token: string } };
      chrome.storage.local.set({
        "session-token": data.json.token,
        username,
      });
      setPending(false);
      onSuccess(username);
    } catch {
      setError("Network error");
      setPending(false);
    }
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-lg items-center gap-2"
      >
        <input
          name="username"
          type="text"
          placeholder="Username"
          autoFocus
          required
          className="h-8 w-32 rounded border px-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="h-8 w-32 rounded border px-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "..." : "Sign in"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded px-2 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </form>
      <p className="mx-auto mt-1.5 max-w-lg text-xs text-muted-foreground">
        No account? Sign up at{" "}
        <a
          href={`${__SERVER_URL__}/register`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {__SERVER_URL__.replace(/^https?:\/\//, "")}
        </a>
      </p>
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
