import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { SyncStatus } from "../lib/sync.ts";
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
}: {
  sync: SyncStatus;
  runtime: CaptionPanelRuntime;
}) {
  const { state } = sync;
  const { icon, label, tone, hint } = syncStateDisplay(state);
  const run = getSyncAction(sync, runtime);
  const description = run && hint ? `${label}: ${hint}` : label;

  // Icon only, so the track picker beside it keeps its width as the state
  // changes.
  return (
    // Below and right-aligned, like the settings menu beside it, so the
    // tooltip stays over the panel instead of the page around it.
    <Tooltip content={description} side="bottom" align="end">
      <button
        type="button"
        className={[
          "flex shrink-0 rounded border p-0.5",
          tone === "action"
            ? "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20"
            : tone === "error"
              ? "border-destructive/40 bg-destructive/10 hover:bg-destructive/20"
              : "border-transparent",
          tone === "quiet" && run ? "hover:bg-muted" : "",
          run ? "" : "cursor-default",
        ].join(" ")}
        aria-label={description}
        // Not `disabled`, which would also block the tooltip's hover.
        aria-disabled={!run}
        onClick={run}
        data-testid="sync-status"
        data-sync-state={state}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

function getSyncAction(
  sync: SyncStatus,
  runtime: CaptionPanelRuntime,
): (() => void) | undefined {
  const { onCheck, onPush, onPull, onNavigate } = sync;
  switch (sync.state) {
    case "push":
    case "empty": {
      return () => onPush(runtime);
    }
    case "pull": {
      return () => onPull(runtime);
    }
    // The bookmarks page resolves conflicts and holds sign-in.
    case "conflict":
    case "unauthenticated": {
      return onNavigate;
    }
    case "synced":
    case "error": {
      return onCheck;
    }
    default: {
      return undefined;
    }
  }
}
