import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
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
        label: "Sign in to sync",
      };
    case "checking":
      return {
        icon: <Loader2 className="size-4 animate-spin" />,
        label: "Sync: checking…",
      };
    case "synced":
      return {
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        label: "Synced",
      };
    case "push":
      return {
        icon: <ArrowUpFromLine className="size-4 text-yellow-500" />,
        label: "Sync: upload",
      };
    case "pull":
      return {
        icon: <ArrowDownToLine className="size-4 text-yellow-500" />,
        label: "Sync: download",
      };
    case "conflict":
      return {
        icon: <AlertTriangle className="size-4 text-yellow-500" />,
        label: "Sync conflict",
      };
    case "syncing":
      return {
        icon: <RefreshCw className="size-4 animate-spin" />,
        label: "Syncing…",
      };
    case "error":
      return {
        icon: <AlertTriangle className="size-4 text-destructive" />,
        label: "Sync error",
      };
    case "unknown":
      return {
        icon: <AlertTriangle className="size-4 text-destructive" />,
        label: "Sync: unknown",
      };
  }
}
