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

export function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : text.trim();
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
