import { useMutation, useQuery } from "@tanstack/react-query";
import {
  EllipsisVertical,
  ExternalLink,
  LogIn,
  LogOut,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { BookmarksPage } from "../../components/bookmarks-page.tsx";
import { LoginDialog } from "../../components/login-dialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { useVideoListSync } from "../../components/use-video-list-sync.ts";
import type { VideoListEntry } from "../../components/use-video-list-sync.ts";
import {
  type CaptionStorage,
  videoIndexStore,
} from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
import { useTheme } from "../../lib/theme.ts";
import { chromeStorage } from "../lib/chrome-storage.ts";

export function ExtensionBookmarksPage({
  storage,
  serverUrl,
  isDevelopment,
}: {
  storage: CaptionStorage;
  serverUrl: string;
  isDevelopment: boolean;
}) {
  const [entries] = videoIndexStore.useValue("entries");
  const usernameQuery = useQuery(
    chromeStorage.queryOptions<string>("username"),
  );
  const { theme, cycle, Icon } = useTheme();
  const sync = useVideoListSync(storage);
  const [showLogin, setShowLogin] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const deleteMutation = useMutation(
    orpc.videos.deleteVideo.mutationOptions({
      onSuccess: () => sync.refetch(),
    }),
  );

  async function onDelete(entry: VideoListEntry) {
    if (entry.serverId) {
      deleteMutation.mutate({ id: entry.serverId });
    }
    await storage.deleteVideo(entry.youtubeId);
  }

  const handleLogout = async () => {
    await orpc.auth.logout.call({});
    await chromeStorage.remove(["session-token", "username"]);
    usernameQuery.refetch();
    sync.refetch();
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          Zamak
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium uppercase leading-none text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            ext
          </span>
        </span>
        <div className="flex items-center gap-2">
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
              className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              <LogIn className="size-3" />
              Sign in to sync
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
                onClick={(event) => {
                  event.preventDefault();
                  cycle();
                }}
                className="gap-2"
              >
                <Icon className="size-4" />
                <span className="capitalize">{theme}</span>
              </DropdownMenuItem>
              {isDevelopment && (
                <DropdownMenuItem
                  onClick={() => setAdvancedOpen(true)}
                  className="gap-2"
                >
                  <Settings className="size-4" />
                  Advanced
                </DropdownMenuItem>
              )}
              {sync.authenticated && (
                <DropdownMenuItem
                  onClick={() =>
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
                    onClick={handleLogout}
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
      {isDevelopment && (
        <AdvancedDialog
          serverUrl={serverUrl}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
        />
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
        description={
          <>
            Sync your bookmarks to access them on any device via the{" "}
            <a
              href={serverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              web app
            </a>
            .
          </>
        }
      />
      <main className="flex-1 overflow-auto">
        <BookmarksPage
          entries={entries}
          videoHref={(id) => `https://www.youtube.com/watch?v=${id}`}
          onDelete={onDelete}
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

const SERVER_PRESETS = [
  { label: "Production", url: "https://zamak.hiro18181.workers.dev" },
  { label: "Local", url: "http://localhost:5173" },
];

function AdvancedDialog({
  serverUrl,
  open,
  onOpenChange,
}: {
  serverUrl: string;
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
