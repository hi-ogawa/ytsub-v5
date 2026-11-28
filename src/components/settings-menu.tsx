import {
  Check,
  ClipboardPaste,
  Download,
  EllipsisVertical,
  ExternalLink,
  Minus,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { TEXT_SIZE } from "../lib/caption-panel-preferences.ts";
import type {
  CaptionPanelRuntime,
  CaptionSession,
} from "../lib/caption-panel-runtime.ts";
import type { YouTubeCaptionTrack } from "../lib/youtube.ts";
import { downloadText } from "../utils/download-text.ts";
import { AiPromptCopy, importAiResult } from "./ai-prompt-menu.tsx";
import type { BookmarksPageTarget } from "./caption-panel.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

export function SettingsDropdown({
  runtime,
  session,
  tracks,
  autoScroll,
  onSetAutoScroll,
  textSize,
  onSetTextSize,
  bookmarksPageTarget,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
  tracks: YouTubeCaptionTrack[];
  autoScroll: boolean;
  onSetAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
  textSize: number;
  onSetTextSize: (value: number) => void;
  bookmarksPageTarget: BookmarksPageTarget;
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
        <DropdownMenuItem
          data-checked={autoScroll}
          onSelect={(event) => {
            event.preventDefault();
            onSetAutoScroll((v) => !v);
          }}
        >
          <Check
            className={`mr-2 size-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
          />
          Auto-scroll
        </DropdownMenuItem>
        <TextSizeStepper textSize={textSize} onSetTextSize={onSetTextSize} />
        <AiPromptCopy session={session} tracks={tracks} />
        <DropdownMenuItem onSelect={() => importAiResult({ runtime, session })}>
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
        <div className="my-1 h-px bg-border" />
        <BookmarksPageItem bookmarksPageTarget={bookmarksPageTarget}>
          <ExternalLink className="mr-2 size-4" />
          Open bookmarks page
        </BookmarksPageItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A link when the host has a URL for the bookmarks page, so middle-click,
 * modifier-click, and the hover URL work.
 */
function BookmarksPageItem({
  bookmarksPageTarget,
  children,
}: {
  bookmarksPageTarget: BookmarksPageTarget;
  children: ReactNode;
}) {
  switch (bookmarksPageTarget.type) {
    case "link": {
      return (
        <DropdownMenuItem asChild>
          <Link to={bookmarksPageTarget.href}>{children}</Link>
        </DropdownMenuItem>
      );
    }
    case "handler": {
      return (
        <DropdownMenuItem onSelect={bookmarksPageTarget.onOpen}>
          {children}
        </DropdownMenuItem>
      );
    }
  }
}

/**
 * Each button keeps the menu open, so the captions behind it resize live
 * while stepping.
 */
function TextSizeStepper({
  textSize,
  onSetTextSize,
}: {
  textSize: number;
  onSetTextSize: (value: number) => void;
}) {
  return (
    <div className="flex items-center">
      <div className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-sm">
        <Type className="mr-2 size-4" />
        Text size
      </div>
      <div className="flex shrink-0 items-center">
        <DropdownMenuItem
          className="px-1.5"
          title="Smaller text"
          aria-label="Smaller text"
          disabled={textSize <= TEXT_SIZE.min}
          onSelect={(event) => {
            event.preventDefault();
            onSetTextSize(textSize - 1);
          }}
        >
          <Minus className="size-4" />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="w-10 justify-center tabular-nums"
          title={`Reset to ${TEXT_SIZE.default} px`}
          aria-label={`Text size ${textSize} px, reset to ${TEXT_SIZE.default} px`}
          data-testid="text-size-value"
          onSelect={(event) => {
            event.preventDefault();
            onSetTextSize(TEXT_SIZE.default);
          }}
        >
          {textSize}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-1.5"
          title="Larger text"
          aria-label="Larger text"
          disabled={textSize >= TEXT_SIZE.max}
          onSelect={(event) => {
            event.preventDefault();
            onSetTextSize(textSize + 1);
          }}
        >
          <Plus className="size-4" />
        </DropdownMenuItem>
      </div>
    </div>
  );
}

export function SettingsDropdownSkeleton() {
  return (
    <div className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-50">
      <EllipsisVertical className="size-4" />
    </div>
  );
}
