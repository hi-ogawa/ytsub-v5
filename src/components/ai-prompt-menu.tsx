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
import type { CaptionSessionManager } from "../lib/caption-session.ts";
import type { YouTubeCaptionTrack } from "../lib/youtube.ts";

export function AiPromptCopy({
  store,
  tracks,
}: {
  store: CaptionSessionManager;
  tracks: YouTubeCaptionTrack[];
}) {
  const [selected, setSelected] = useState<AiTask>(AI_TASKS[0].task);
  const [copied, setCopied] = useState(false);
  const { youtubeId, title } = store.videoMeta;

  function getPrompt(task: AiTask) {
    return makeAiPrompt(task, {
      youtubeId,
      title,
      rows: store.rows,
      bookmarks: store.bookmarks,
      tracks,
      vssId1: store.vssId1,
      vssId2: store.vssId2,
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
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zamak-${youtubeId}-prompt-${task}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
          onChange={(e) => {
            setSelected(e.target.value as AiTask);
            copyPrompt(e.target.value as AiTask);
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

export function importAiResult(store: CaptionSessionManager): void {
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
          store.rows,
        );
        if (bookmarks.length > 0) {
          store.createBookmarks(bookmarks);
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
        store.updateBookmarks(result.entries);
        alert(`Filled ${result.entries.length} bookmarks`);
        break;
      case "fix-asr": {
        const { captions, bookmarks, errors } = alignResultToSession(
          result,
          store.bookmarks,
        );
        if (errors.length > 0) {
          alert(
            `Nothing imported. ${errors.length} bookmark problems:\n${errors.join("\n")}`,
          );
          break;
        }
        const moved = store.bookmarks.length;
        store.replace({ captions, bookmarks });
        alert(
          `Replaced captions with ${captions.length} rows, moved ${moved} bookmarks, and added ${bookmarks.length - moved}`,
        );
        break;
      }
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : "Invalid JSON");
  }
}
