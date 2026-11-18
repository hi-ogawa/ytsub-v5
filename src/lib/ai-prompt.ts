import promptMd from "./ai-prompt.md?raw";
import type { MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import type { YouTubeCaptionTrack } from "./youtube.ts";

export const AI_TASKS = [
  { label: "Pick & Fill", task: "pick-fill" },
  { label: "Fill Bookmarks", task: "fill" },
  { label: "Fix & Align ASR", task: "fix-asr" },
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

// An entry with an id moves an existing bookmark, and one without adds a new
// bookmark.
type AiImportAlignBookmark = {
  id?: string;
  captionIndex: number;
  offset: number;
  text: string;
  side?: 0 | 1;
  translation?: string;
  etymology?: string;
  notes?: string;
};

type AiImportResult =
  | { type: "pick-fill"; entries: AiImportPickFillEntry[] }
  | { type: "fill"; entries: AiImportFillEntry[] }
  | {
      type: "fix-asr";
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
  function placeOnRow(a: AiImportAlignBookmark, side: number) {
    const row = captions[a.captionIndex];
    if (!row) {
      errors.push(`"${a.text}": captionIndex ${a.captionIndex} out of range`);
      return;
    }
    const rowText = side === 0 ? row.text1 : row.text2;
    if (rowText.slice(a.offset, a.offset + a.text.length) !== a.text) {
      errors.push(
        `"${a.text}" not at offset ${a.offset} in caption ${a.captionIndex}: "${rowText}"`,
      );
      return;
    }
    return {
      captionIndex: a.captionIndex,
      offset: a.offset,
      text: a.text,
      context: rowText,
      timestamp: row.begin,
    };
  }

  const anchors = new Map(
    result.bookmarks.flatMap((a) => (a.id ? [[a.id, a] as const] : [])),
  );
  for (const id of anchors.keys()) {
    if (!bookmarks.some((b) => b.id === id)) {
      errors.push(`Unknown bookmark id ${id}`);
    }
  }
  const moved = bookmarks.flatMap((b) => {
    const a = anchors.get(b.id);
    if (!a) {
      errors.push(`"${b.text}" (${b.id}) is missing`);
      return [];
    }
    const placed = placeOnRow(a, b.side);
    return placed ? [{ ...b, ...placed }] : [];
  });
  const added = result.bookmarks.flatMap((a) => {
    if (a.id) return [];
    const side = a.side ?? 0;
    const placed = placeOnRow(a, side);
    if (!placed) return [];
    return [
      {
        ...placed,
        id: crypto.randomUUID(),
        side,
        translation: a.translation,
        etymology: a.etymology,
        notes: a.notes,
        createdAt: new Date().toISOString(),
      },
    ];
  });
  return { captions, bookmarks: [...moved, ...added], errors };
}

export function parseAiResult(raw: string): AiImportResult {
  const json = JSON.parse(extractJson(raw));
  switch (json?.type) {
    case "pick-fill":
    case "fill": {
      return { type: json.type, entries: json.entries };
    }
    case "fix-asr": {
      return {
        type: "fix-asr",
        captions: json.captions,
        bookmarks: json.bookmarks,
      };
    }
    default: {
      throw new Error(
        `Expected a "type" field of ${AI_TASKS.map((t) => `"${t.task}"`).join(", ")}`,
      );
    }
  }
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
  const label = AI_TASKS.find((t) => t.task === task)!.label;
  return `${sections.header}\n\n${template}`
    .replace(/\{\{TASK\}\}/g, label)
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
