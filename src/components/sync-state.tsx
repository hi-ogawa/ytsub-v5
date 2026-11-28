import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CloudOff,
  Loader2,
  LogIn,
  RefreshCw,
} from "lucide-react";
import type { SyncState } from "../lib/sync.ts";

/**
 * How a sync state looks and reads on every surface that shows it, so the
 * caption panel and the bookmarks page agree. `tone` decides whether it looks
 * like a button, and `hint` says what clicking it does, for surfaces that act
 * on that state.
 */
export function syncStateDisplay(state: SyncState): {
  icon: React.ReactNode;
  label: string;
  tone: "quiet" | "action" | "error";
  hint?: string;
} {
  switch (state) {
    case "unauthenticated":
      return {
        icon: <LogIn className="size-4 text-muted-foreground" />,
        label: "Sign in",
        tone: "quiet",
        hint: "click to sign in",
      };
    case "checking":
      return {
        icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
        label: "Checking…",
        tone: "quiet",
      };
    case "synced":
      return {
        icon: <CheckCircle2 className="size-4 text-muted-foreground" />,
        label: "Synced",
        tone: "quiet",
        hint: "click to check again",
      };
    case "push":
      return {
        icon: <ArrowUpFromLine className="size-4 text-yellow-500" />,
        label: "Upload",
        tone: "action",
        hint: "click to upload",
      };
    case "pull":
      return {
        icon: <ArrowDownToLine className="size-4 text-yellow-500" />,
        label: "Download",
        tone: "action",
        hint: "click to download",
      };
    case "conflict":
      return {
        icon: <AlertTriangle className="size-4 text-yellow-500" />,
        label: "Conflict",
        tone: "action",
        hint: "click to choose which copy to keep",
      };
    case "syncing":
      return {
        icon: (
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
        ),
        label: "Syncing…",
        tone: "quiet",
      };
    case "error":
      return {
        icon: <AlertTriangle className="size-4 text-destructive" />,
        label: "Sync error",
        tone: "error",
        hint: "click to check again",
      };
    case "empty":
      return {
        icon: <CloudOff className="size-4 text-muted-foreground" />,
        label: "Not uploaded",
        tone: "quiet",
        hint: "click to upload",
      };
    default: {
      return state satisfies never;
    }
  }
}
