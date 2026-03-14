import promptMd from "./ai-prompt.md?raw";
import type { MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";

export const AI_TASKS = [
  { label: "Pick & Fill", task: "pick-fill" },
  { label: "Fill Bookmarks", task: "fill" },
  { label: "Fix Korean ASR", task: "fix-asr" },
] as const;

export type AiTask = (typeof AI_TASKS)[number]["task"];

// Split "# --- task-name ---" sections
const sections: Record<string, string> = {};
for (const chunk of (promptMd as string).split(/^# --- /m).slice(1)) {
  const nl = chunk.indexOf("\n");
  const key = chunk.slice(0, nl).replace(/ ---$/, "").trim();
  sections[key] = chunk.slice(nl + 1).trim();
}

function formatCaptions(rows: MergedCaption[]): string {
  return rows
    .map((r) => {
      const m = Math.floor(r.begin / 60);
      const s = String(Math.floor(r.begin % 60)).padStart(2, "0");
      return `[${r.idx}] ${m}:${s} | ${r.text1} | ${r.text2}`;
    })
    .join("\n");
}

function formatBookmarks(
  rows: MergedCaption[],
  bookmarks: ExtensionBookmark[],
): string {
  const unfilled = bookmarks.filter((b) => !b.translation);
  const bms = (unfilled.length > 0 ? unfilled : bookmarks).map((b) => {
    const caption = rows[b.captionIndex];
    const ctx = caption ? { text1: caption.text1, text2: caption.text2 } : null;
    return { id: b.id, text: b.text, context: b.context, caption: ctx };
  });
  return JSON.stringify(bms, null, 2);
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : text.trim();
}

// --- AI result import (parse raw AI response → typed action) ---

type AiImportPickFillEntry = {
  captionIndex: number;
  text: string;
  translation?: string;
  etymology?: string;
  notes?: string;
};

type AiImportFillEntry = {
  id: string;
  translation?: string;
  etymology?: string;
  notes?: string;
};

type AiImportCaptionEntry = {
  idx: number;
  text1?: string;
};

type AiImportResult =
  | { type: "pick-fill"; entries: AiImportPickFillEntry[] }
  | { type: "fill"; entries: AiImportFillEntry[] }
  | { type: "fix-asr"; entries: AiImportCaptionEntry[] };

export function pickFillToBookmarks(
  entries: AiImportPickFillEntry[],
  rows: MergedCaption[],
): {
  bookmarks: Omit<ExtensionBookmark, "id" | "createdAt">[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const bookmarks = entries.flatMap((e) => {
    const row = rows[e.captionIndex];
    if (!row) {
      warnings.push(`captionIndex ${e.captionIndex} out of range`);
      return [];
    }
    const offset = row.text1.indexOf(e.text);
    if (offset === -1) {
      warnings.push(
        `"${e.text}" not found in caption ${e.captionIndex}: "${row.text1}"`,
      );
      return [];
    }
    return [
      {
        text: e.text,
        side: 0,
        offset,
        captionIndex: e.captionIndex,
        timestamp: row.begin,
        context: row.text1,
        translation: e.translation,
        etymology: e.etymology,
        notes: e.notes,
      },
    ];
  });
  return { bookmarks, warnings };
}

export function parseAiResult(raw: string): AiImportResult {
  const json = JSON.parse(extractJson(raw));
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error("Expected a non-empty JSON array");
  }
  const first = json[0];
  if ("captionIndex" in first && "text" in first) {
    return { type: "pick-fill", entries: json };
  }
  if ("id" in first && "translation" in first) {
    return { type: "fill", entries: json };
  }
  if ("idx" in first && "text1" in first) {
    return { type: "fix-asr", entries: json };
  }
  throw new Error("Unrecognized JSON shape");
}

export function makeAiPrompt(
  task: AiTask,
  rows: MergedCaption[],
  bookmarks: ExtensionBookmark[],
  title: string,
  duration: number | undefined,
): string {
  const template = sections[task];
  if (!template) return "";
  const target = duration ? `~${Math.round(duration / 10)}` : "5-15";
  return template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{TARGET\}\}/g, target)
    .replace(/\{\{CAPTIONS\}\}/g, formatCaptions(rows))
    .replace(/\{\{BOOKMARKS\}\}/g, formatBookmarks(rows, bookmarks));
}
