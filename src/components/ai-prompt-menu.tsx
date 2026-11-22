import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  type AiTask,
  AI_TASKS,
  alignResultToSession,
  makeAiPrompt,
  parseAiResult,
  pickFillToBookmarks,
} from "../lib/ai-prompt.ts";
import type {
  CaptionPanelRuntime,
  CaptionSession,
} from "../lib/caption-panel-runtime.ts";
import type { YouTubeCaptionTrack } from "../lib/youtube.ts";
import { downloadText } from "../utils/download-text.ts";

export function AiPromptCopy({
  session,
  tracks,
}: {
  session: CaptionSession;
  tracks: YouTubeCaptionTrack[];
}) {
  const [selected, setSelected] = useState<AiTask>(AI_TASKS[0].task);
  const [copied, setCopied] = useState(false);
  const { youtubeId, title } = session.video;

  function getPrompt(task: AiTask) {
    return makeAiPrompt(task, {
      youtubeId,
      title,
      rows: session.rows,
      bookmarks: session.bookmarks,
      tracks,
      vssId1: session.vssId1,
      vssId2: session.vssId2,
    });
  }

  function copyPrompt(task: AiTask) {
    navigator.clipboard.writeText(getPrompt(task));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadPrompt(task: AiTask) {
    const text = getPrompt(task);
    if (!text) {
      return;
    }
    downloadText({
      filename: `zamak-${youtubeId}-prompt-${task}.txt`,
      text,
      type: "text/plain",
    });
  }

  return (
    <div className="px-2 py-1.5">
      <label className="mb-1 block text-sm text-muted-foreground flex items-center gap-1">
        AI prompt{" "}
        <a
          href="https://github.com/hi-ogawa/ytsub-v5/blob/main/skills/zamak/SKILL.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex align-middle text-muted-foreground/70 hover:text-foreground"
          title="How to use AI prompts"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </label>
      <div className="flex gap-1">
        <select
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm"
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value as AiTask);
            copyPrompt(event.target.value as AiTask);
          }}
        >
          {AI_TASKS.map((p) => (
            <option key={p.task} value={p.task}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Copy prompt"
          onClick={() => copyPrompt(selected)}
        >
          {copied ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Download prompt"
          onClick={() => downloadPrompt(selected)}
        >
          <Download className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function importAiResult({
  runtime,
  session,
}: {
  runtime: CaptionPanelRuntime;
  session: CaptionSession;
}): void {
  const raw = window.prompt("Paste AI result JSON");
  if (!raw) {
    return;
  }
  try {
    const result = parseAiResult(raw);
    switch (result.type) {
      case "pick-fill": {
        const { bookmarks, warnings } = pickFillToBookmarks(
          result.entries,
          session.rows,
        );
        if (bookmarks.length > 0) {
          runtime.createBookmarks(bookmarks);
        }
        alert(
          `Created ${bookmarks.length} bookmarks` +
            (warnings.length > 0
              ? `\n\n${warnings.length} skipped:\n${warnings.join("\n")}`
              : ""),
        );
        break;
      }
      case "fill":
        runtime.updateBookmarks(result.entries);
        alert(`Filled ${result.entries.length} bookmarks`);
        break;
      case "fix-asr": {
        const { captions, bookmarks, errors } = alignResultToSession(
          result,
          session.bookmarks,
        );
        if (errors.length > 0) {
          alert(
            `Nothing imported. ${errors.length} bookmark problems:\n${errors.join("\n")}`,
          );
          break;
        }
        const moved = session.bookmarks.length;
        runtime.replace({ captions, bookmarks });
        alert(
          `Replaced captions with ${captions.length} rows, moved ${moved} bookmarks, and added ${bookmarks.length - moved}`,
        );
        break;
      }
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : "Invalid JSON");
  }
}
