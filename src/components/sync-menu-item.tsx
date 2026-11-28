import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import { Link } from "react-router";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { SyncStatus, UseSync } from "../lib/sync.ts";
import { syncStateDisplay } from "./sync-state.tsx";
import { DropdownMenuItem } from "./ui/dropdown-menu.tsx";

/**
 * Where the bookmarks page lives for the host. The web app links to its own
 * route, while a YouTube page can't link to the extension's page, so the
 * extension opens it through a handler.
 */
export type BookmarksPage = { href: string } | { onOpen: () => void };

/**
 * The menu content mounts each time the menu opens, so the sync hook's
 * queries refetch then.
 */
export function SyncMenuItem({
  useSync,
  runtime,
  bookmarksPage,
}: {
  useSync: UseSync;
  runtime: CaptionPanelRuntime;
  bookmarksPage: BookmarksPage;
}) {
  const sync = useSync({ youtubeId: runtime.youtubeId });
  const { state, error } = sync;
  const { icon, label } = syncStateDisplay(state);
  const action = getSyncMenuAction({ sync, runtime });

  const content = (
    <>
      <span className="mr-2 size-4">{icon}</span>
      {label}
    </>
  );
  const testAttrs = {
    "data-testid": "sync-status",
    "data-sync-state": state,
  };

  return (
    <>
      {/* min-w-52 keeps the menu from resizing as the label changes. */}
      <div className="flex min-w-52">
        {action === "openBookmarksPage" ? (
          <BookmarksPageItem
            bookmarksPage={bookmarksPage}
            className="min-w-0 flex-1"
            {...testAttrs}
          >
            {content}
          </BookmarksPageItem>
        ) : action ? (
          <DropdownMenuItem
            className="min-w-0 flex-1"
            onSelect={(event) => {
              if (action.keepOpen) {
                event.preventDefault();
              }
              action.run();
            }}
            {...testAttrs}
          >
            {content}
          </DropdownMenuItem>
        ) : (
          <div
            className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-sm"
            {...testAttrs}
          >
            {content}
          </div>
        )}
        <div className="shrink-0">
          <BookmarksPageItem
            bookmarksPage={bookmarksPage}
            className="px-1.5 text-muted-foreground"
            title="Open bookmarks page"
            aria-label="Open bookmarks page"
          >
            <ExternalLink className="size-4" />
          </BookmarksPageItem>
        </div>
      </div>
      {error && (
        <div
          className="w-0 min-w-full pr-2 pb-1.5 pl-8 text-xs text-destructive"
          data-testid="sync-error"
        >
          {error}
        </div>
      )}
      <div className="my-1 h-px bg-border" />
    </>
  );
}

/**
 * A link when the host has a URL for the bookmarks page, so middle-click,
 * modifier-click, and the hover URL work, and a plain item otherwise.
 */
function BookmarksPageItem({
  bookmarksPage,
  children,
  ...props
}: { bookmarksPage: BookmarksPage } & ComponentProps<typeof DropdownMenuItem>) {
  if ("href" in bookmarksPage) {
    return (
      <DropdownMenuItem asChild {...props}>
        <Link to={bookmarksPage.href}>{children}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onSelect={bookmarksPage.onOpen} {...props}>
      {children}
    </DropdownMenuItem>
  );
}

/**
 * A row is clickable only when clicking it does something. Push and pull run
 * in place, with the menu kept open to show progress, and states whose next
 * step lives on the bookmarks page open it.
 */
function getSyncMenuAction({
  sync,
  runtime,
}: {
  sync: SyncStatus;
  runtime: CaptionPanelRuntime;
}): { run: () => void; keepOpen: boolean } | "openBookmarksPage" | undefined {
  const { onPush, onPull } = sync;
  switch (sync.state) {
    case "push":
    case "empty": {
      return { run: () => onPush(runtime), keepOpen: true };
    }
    case "pull": {
      return { run: () => onPull(runtime), keepOpen: true };
    }
    case "conflict":
    case "unauthenticated": {
      return "openBookmarksPage";
    }
    default: {
      return undefined;
    }
  }
}
