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

export function syncStateDisplay(state: SyncState): {
  icon: React.ReactNode;
  label: string;
} {
  switch (state) {
    case "unauthenticated":
      return {
        icon: <LogIn className="size-4 text-muted-foreground" />,
        label: "Sign in",
      };
    case "checking":
      return {
        icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
        label: "Checking…",
      };
    case "synced":
      return {
        icon: <CheckCircle2 className="size-4 text-muted-foreground" />,
        label: "Synced",
      };
    case "push":
      return {
        icon: <ArrowUpFromLine className="size-4 text-yellow-500" />,
        label: "Upload",
      };
    case "pull":
      return {
        icon: <ArrowDownToLine className="size-4 text-yellow-500" />,
        label: "Download",
      };
    case "conflict":
      return {
        icon: <AlertTriangle className="size-4 text-yellow-500" />,
        label: "Conflict",
      };
    case "syncing":
      return {
        icon: (
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
        ),
        label: "Syncing…",
      };
    case "error":
      return {
        icon: <AlertTriangle className="size-4 text-destructive" />,
        label: "Sync error",
      };
    case "empty":
      return {
        icon: <CloudOff className="size-4 text-muted-foreground" />,
        label: "Not uploaded",
      };
    default: {
      return state satisfies never;
    }
  }
}
