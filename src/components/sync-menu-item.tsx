import { ExternalLink } from "lucide-react";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { SyncStatus, UseSync } from "../lib/sync.ts";
import { syncStateDisplay } from "./sync-state.tsx";
import { DropdownMenuItem } from "./ui/dropdown-menu.tsx";

// The menu content mounts each time the menu opens, so the sync hook's
// queries refetch then.
export function SyncMenuItem({
  useSync,
  runtime,
}: {
  useSync: UseSync;
  runtime: CaptionPanelRuntime;
}) {
  const sync = useSync({ youtubeId: runtime.youtubeId });
  const { state, error, onNavigate } = sync;
  const { icon, label } = syncStateDisplay(state);
  const action = getSyncMenuAction(sync, runtime);

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
        {action ? (
          <DropdownMenuItem
            className="min-w-0 flex-1"
            onClick={(event) => {
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
          <DropdownMenuItem
            className="px-1.5 text-muted-foreground"
            onClick={onNavigate}
            title="Open bookmarks page"
            aria-label="Open bookmarks page"
          >
            <ExternalLink className="size-4" />
          </DropdownMenuItem>
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

// A row is clickable only when clicking it does something. Push and pull run
// in place, with the menu kept open to show progress, and states whose next
// step lives on the bookmarks page open it.
function getSyncMenuAction(
  sync: SyncStatus,
  runtime: CaptionPanelRuntime,
): { run: () => void; keepOpen: boolean } | undefined {
  const { onPush, onPull, onNavigate } = sync;
  switch (sync.state) {
    case "push": {
      return { run: () => onPush(runtime), keepOpen: true };
    }
    case "pull": {
      return { run: () => onPull(runtime), keepOpen: true };
    }
    case "conflict":
    case "unauthenticated": {
      return { run: onNavigate, keepOpen: false };
    }
    default: {
      return undefined;
    }
  }
}
