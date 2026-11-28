import { Link } from "react-router";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { SyncStatus } from "../lib/sync.ts";
import type { BookmarksPageTarget } from "./caption-panel.tsx";
import { syncStateDisplay } from "./sync-state.tsx";
import { Tooltip } from "./ui/tooltip.tsx";

/**
 * The caption panel's sync status, shown like a document's save status.
 * States that need nothing from the user stay muted, and only states that
 * need a decision look like a button.
 */
export function SyncIndicator({
  sync,
  runtime,
  bookmarksPageTarget,
}: {
  sync: SyncStatus;
  runtime: CaptionPanelRuntime;
  bookmarksPageTarget: BookmarksPageTarget;
}) {
  const { state } = sync;
  const { icon, label, tone, hint } = syncStateDisplay(state);
  const action = getSyncAction({ sync, runtime, bookmarksPageTarget });
  const description = action && hint ? `${label}: ${hint}` : label;
  const className = [
    "flex shrink-0 rounded border p-0.5",
    tone === "action"
      ? "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20"
      : tone === "error"
        ? "border-destructive/40 bg-destructive/10 hover:bg-destructive/20"
        : "border-transparent",
    tone === "quiet" && action ? "hover:bg-muted" : "",
    action ? "" : "cursor-default",
  ].join(" ");
  const testAttrs = {
    "data-testid": "sync-status",
    "data-sync-state": state,
  };

  // Icon only, so the track picker beside it keeps its width as the state
  // changes.
  return (
    // Below and right-aligned, like the settings menu beside it, so the
    // tooltip stays over the panel instead of the page around it.
    <Tooltip content={description} side="bottom" align="end">
      {action?.type === "link" ? (
        <Link
          to={action.href}
          className={className}
          aria-label={description}
          {...testAttrs}
        >
          {icon}
        </Link>
      ) : (
        <button
          type="button"
          className={className}
          aria-label={description}
          // Not `disabled`, which would also block the tooltip's hover.
          aria-disabled={!action}
          onClick={action?.onClick}
          {...testAttrs}
        >
          {icon}
        </button>
      )}
    </Tooltip>
  );
}

function getSyncAction({
  sync,
  runtime,
  bookmarksPageTarget,
}: {
  sync: SyncStatus;
  runtime: CaptionPanelRuntime;
  bookmarksPageTarget: BookmarksPageTarget;
}):
  | { type: "handler"; onClick: () => void }
  | { type: "link"; href: string }
  | undefined {
  const { onCheck, onPush, onPull } = sync;
  switch (sync.state) {
    case "push":
    case "empty": {
      return { type: "handler", onClick: () => onPush(runtime) };
    }
    case "pull": {
      return { type: "handler", onClick: () => onPull(runtime) };
    }
    // The bookmarks page resolves conflicts and holds sign-in.
    case "conflict":
    case "unauthenticated": {
      return bookmarksPageTarget.type === "link"
        ? bookmarksPageTarget
        : { type: "handler", onClick: bookmarksPageTarget.onOpen };
    }
    case "synced":
    case "error": {
      return { type: "handler", onClick: onCheck };
    }
    default: {
      return undefined;
    }
  }
}
