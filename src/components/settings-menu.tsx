import {
  Check,
  ClipboardPaste,
  Download,
  EllipsisVertical,
  Trash2,
} from "lucide-react";
import { ALL_STRATEGIES, type MergeStrategy } from "../lib/caption-merge.ts";
import type { CaptionSessionManager } from "../lib/caption-session.ts";
import type { UseSync } from "../lib/sync.ts";
import type { YouTubeCaptionTrack } from "../lib/youtube.ts";
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
  store,
  tracks,
  autoScroll,
  onSetAutoScroll,
  onSelectStrategy,
  useSync,
  sessionOnly,
}: {
  store: CaptionSessionManager;
  tracks: YouTubeCaptionTrack[];
  autoScroll: boolean;
  onSetAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSelectStrategy: (s: MergeStrategy) => void;
  useSync: UseSync;
  sessionOnly?: boolean;
}) {
  const hasBookmarks = store.bookmarks.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        title="Settings"
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SyncMenuItem useSync={useSync} store={store} />
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
        {!sessionOnly && (
          <div className="px-2 py-1.5">
            <label className="mb-1 block text-sm text-muted-foreground">
              Track alignment
            </label>
            <select
              className={`w-full rounded border bg-background px-1 py-0.5 text-sm ${hasBookmarks ? "cursor-not-allowed opacity-50" : ""}`}
              value={store.strategy}
              onChange={(e) =>
                onSelectStrategy(e.target.value as MergeStrategy)
              }
              title={
                hasBookmarks
                  ? "Cannot change while bookmarks exist"
                  : "Alignment strategy"
              }
              disabled={hasBookmarks}
            >
              {ALL_STRATEGIES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        )}
        <AiPromptCopy store={store} tracks={tracks} />
        <DropdownMenuItem onSelect={() => importAiResult(store)}>
          <ClipboardPaste className="mr-2 size-4" />
          Import AI result
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            downloadText({
              filename: `import-${store.videoMeta.youtubeId}.json`,
              text: JSON.stringify(store.toExportData(), null, 2),
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
              store.clearBookmarks();
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
