import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { SyncState, SyncStatus } from "../lib/sync.ts";
import { syncStateDisplay } from "./sync-state.tsx";

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
  const { icon, label } = syncStateDisplay(state);
  const action = getSyncAction(sync, runtime);
  const tone = getSyncTone(state);

  return (
    <button
      type="button"
      className={[
        "flex shrink-0 items-center gap-1 rounded border px-1 py-0.5 text-xs whitespace-nowrap",
        tone === "action"
          ? "border-yellow-500/40 bg-yellow-500/10 font-medium text-yellow-600 hover:bg-yellow-500/20"
          : tone === "error"
            ? "border-destructive/40 bg-destructive/10 font-medium text-destructive hover:bg-destructive/20"
            : "border-transparent text-muted-foreground",
        tone === "quiet" && action ? "hover:bg-muted" : "",
      ].join(" ")}
      title={action ? `${label}: ${action.hint}` : label}
      disabled={!action}
      onClick={action?.run}
      data-testid="sync-status"
      data-sync-state={state}
    >
      {icon}
      {label}
    </button>
  );
}

function getSyncTone(state: SyncState): "quiet" | "action" | "error" {
  switch (state) {
    case "push":
    case "pull":
    case "conflict": {
      return "action";
    }
    case "error": {
      return "error";
    }
    default: {
      return "quiet";
    }
  }
}

function getSyncAction(
  sync: SyncStatus,
  runtime: CaptionPanelRuntime,
): { run: () => void; hint: string } | undefined {
  const { onCheck, onPush, onPull, onNavigate } = sync;
  switch (sync.state) {
    case "push":
    case "empty": {
      return { run: () => onPush(runtime), hint: "click to upload" };
    }
    case "pull": {
      return { run: () => onPull(runtime), hint: "click to download" };
    }
    case "conflict": {
      return {
        run: onNavigate,
        hint: "click to resolve on the bookmarks page",
      };
    }
    case "unauthenticated": {
      return {
        run: onNavigate,
        hint: "click to sign in on the bookmarks page",
      };
    }
    case "synced":
    case "error": {
      return { run: onCheck, hint: "click to check again" };
    }
    default: {
      return undefined;
    }
  }
}
