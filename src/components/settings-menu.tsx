import {
  Check,
  ClipboardPaste,
  Download,
  EllipsisVertical,
  Trash2,
} from "lucide-react";
import type {
  CaptionPanelRuntime,
  CaptionSession,
} from "../lib/caption-panel-runtime.ts";
import type { UseSync } from "../lib/sync.ts";
import { downloadText } from "../utils/download-text.ts";
import { AiPromptCopy, importAiResult } from "./ai-prompt-menu.tsx";
import { SyncMenuItem } from "./sync-menu-item.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

export function SettingsDropdown({
  runtime,
  session,
  autoScroll,
  onSetAutoScroll,
  useSync,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
  autoScroll: boolean;
  onSetAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
  useSync: UseSync;
}) {
  const hasBookmarks = session.bookmarks.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        title="Settings"
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SyncMenuItem useSync={useSync} runtime={runtime} />
        <DropdownMenuItem
          data-checked={autoScroll}
          onSelect={(e) => {
            e.preventDefault();
            onSetAutoScroll((v) => !v);
          }}
        >
          <Check
            className={`mr-2 size-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
          />
          Auto-scroll
        </DropdownMenuItem>
        <AiPromptCopy runtime={runtime} session={session} />
        <DropdownMenuItem onSelect={() => importAiResult(runtime)}>
          <ClipboardPaste className="mr-2 size-4" />
          Import AI result
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            downloadText({
              filename: `import-${runtime.youtubeId}.json`,
              text: JSON.stringify(runtime.toExportData(), null, 2),
              type: "application/json",
            });
          }}
        >
          <Download className="mr-2 size-4" />
          Export import.json
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (confirm("Clear all bookmarks for this video?")) {
              runtime.clearBookmarks();
            }
          }}
          disabled={!hasBookmarks}
        >
          <Trash2 className="mr-2 size-4" />
          Clear bookmarks
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SettingsDropdownSkeleton() {
  return (
    <div className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-50">
      <EllipsisVertical className="size-4" />
    </div>
  );
}
