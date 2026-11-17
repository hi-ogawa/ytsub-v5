import promptMd from "./ai-prompt.md?raw";
import type { MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import type { YouTubeCaptionTrack } from "./youtube.ts";

export const AI_TASKS = [
  { label: "Pick & Fill", task: "pick-fill" },
  { label: "Fill Bookmarks", task: "fill" },
  { label: "Fix & Align ASR", task: "align-asr" },
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
    return {
      id: b.id,
      text: b.text,
      captionIndex: b.captionIndex,
      context: b.context,
      caption: ctx,
    };
  });
  return JSON.stringify(bms, null, 2);
}

// Only what the agent needs to re-anchor each bookmark, so translations and
// notes never pass through it.
function formatAnchorBookmarks(bookmarks: ExtensionBookmark[]): string {
  const bms = bookmarks.map((b) => ({
    id: b.id,
    text: b.text,
    captionIndex: b.captionIndex,
    side: b.side,
    context: b.context,
  }));
  return JSON.stringify(bms, null, 2);
}

function formatTracks({
  tracks,
  vssId1,
  vssId2,
}: {
  tracks: YouTubeCaptionTrack[];
  vssId1: string;
  vssId2: string;
}): string {
  const vssIds = [...new Set([vssId1, vssId2, ...tracks.map((t) => t.vssId)])];
  return vssIds
    .map((vssId) => {
      const lang = vssId.split(".").pop();
      const source = vssId.includes(".t.")
        ? "translated"
        : vssId.startsWith("a.")
          ? "ASR"
          : "manual";
      const use =
        vssId === vssId1
          ? ", current text1"
          : vssId === vssId2
            ? ", current text2"
            : "";
      return `- \`${vssId}\`: ${lang}, ${source}${use}`;
    })
    .join("\n");
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

type AiImportAlignCaption = {
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

type AiImportAlignBookmark = {
  id: string;
  captionIndex: number;
  offset: number;
  text: string;
};

type AiImportResult =
  | { type: "pick-fill"; entries: AiImportPickFillEntry[] }
  | { type: "fill"; entries: AiImportFillEntry[] }
  | {
      type: "align-asr";
      captions: AiImportAlignCaption[];
      bookmarks: AiImportAlignBookmark[];
    };

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

export function alignResultToSession(
  result: {
    captions: AiImportAlignCaption[];
    bookmarks: AiImportAlignBookmark[];
  },
  bookmarks: ExtensionBookmark[],
): {
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
  errors: string[];
} {
  const errors: string[] = [];
  const captions: MergedCaption[] = result.captions.map((c, i) => ({
    idx: i,
    begin: c.begin,
    end: c.end,
    text1: c.text1,
    text2: c.text2,
    cue1Indices: [],
    cue2Indices: [],
    text1Segments: [c.text1],
    text2Segments: [c.text2],
  }));
  const anchors = new Map(result.bookmarks.map((a) => [a.id, a]));
  for (const a of result.bookmarks) {
    if (!bookmarks.some((b) => b.id === a.id)) {
      errors.push(`Unknown bookmark id ${a.id}`);
    }
  }
  const anchored = bookmarks.flatMap((b) => {
    const a = anchors.get(b.id);
    if (!a) {
      errors.push(`"${b.text}" (${b.id}) is missing`);
      return [];
    }
    const row = captions[a.captionIndex];
    if (!row) {
      errors.push(`"${a.text}": captionIndex ${a.captionIndex} out of range`);
      return [];
    }
    const rowText = b.side === 0 ? row.text1 : row.text2;
    if (rowText.slice(a.offset, a.offset + a.text.length) !== a.text) {
      errors.push(
        `"${a.text}" not at offset ${a.offset} in caption ${a.captionIndex}: "${rowText}"`,
      );
      return [];
    }
    return [
      {
        ...b,
        captionIndex: a.captionIndex,
        offset: a.offset,
        text: a.text,
        context: rowText,
        timestamp: row.begin,
      },
    ];
  });
  return { captions, bookmarks: anchored, errors };
}

export function parseAiResult(raw: string): AiImportResult {
  const json = JSON.parse(extractJson(raw));
  if (json && Array.isArray(json.captions) && Array.isArray(json.bookmarks)) {
    return {
      type: "align-asr",
      captions: json.captions,
      bookmarks: json.bookmarks,
    };
  }
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error(
      "Expected a non-empty JSON array or an object with captions and bookmarks",
    );
  }
  const first = json[0];
  if ("captionIndex" in first && "text" in first) {
    return { type: "pick-fill", entries: json };
  }
  if ("id" in first && "translation" in first) {
    return { type: "fill", entries: json };
  }
  throw new Error("Unrecognized JSON shape");
}

export function makeAiPrompt(
  task: AiTask,
  session: {
    youtubeId: string;
    title: string;
    rows: MergedCaption[];
    bookmarks: ExtensionBookmark[];
    tracks: YouTubeCaptionTrack[];
    vssId1: string;
    vssId2: string;
  },
): string {
  const template = sections[task];
  if (!template) return "";
  return template
    .replace(/\{\{VIDEO_ID\}\}/g, session.youtubeId)
    .replace(/\{\{TITLE\}\}/g, session.title)
    .replace(/\{\{TRACKS\}\}/g, formatTracks(session))
    .replace(/\{\{CAPTIONS\}\}/g, formatCaptions(session.rows))
    .replace(
      /\{\{BOOKMARKS\}\}/g,
      formatBookmarks(session.rows, session.bookmarks),
    )
    .replace(
      /\{\{ANCHOR_BOOKMARKS\}\}/g,
      formatAnchorBookmarks(session.bookmarks),
    );
}
