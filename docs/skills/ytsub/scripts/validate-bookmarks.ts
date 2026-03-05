// Validate and auto-correct bookmarks.json offsets against captions.json
// Usage: npx tsx validate-bookmarks.ts <bookmarks.json> <captions.json>
//
// For each bookmark, verifies:
//   1. context matches the caption text at captionIdx
//   2. offset points to the correct position of text within context
//
// Auto-corrects offsets when text is found at a different position.
// Writes corrected bookmarks.json to stdout.

import { readFileSync } from "fs";

interface Bookmark {
  text: string;
  translation: string;
  captionIdx: number;
  side: 0 | 1;
  offset: number;
  context: string;
  notes: string;
  status: string;
}

interface Caption {
  idx: number;
  begin: number;
  end: number;
  ko: string;
  en: string;
}

const bookmarksFile = process.argv[2];
const captionsFile = process.argv[3];

if (!bookmarksFile || !captionsFile) {
  console.error(
    "Usage: npx tsx validate-bookmarks.ts <bookmarks.json> <captions.json>",
  );
  process.exit(1);
}

const bookmarks = JSON.parse(
  readFileSync(bookmarksFile, "utf-8"),
) as Bookmark[];
const captions = JSON.parse(readFileSync(captionsFile, "utf-8")) as Caption[];

let fixes = 0;
let errors = 0;

for (const b of bookmarks) {
  const caption = captions.find((c) => c.idx === b.captionIdx);

  // Validate captionIdx exists
  if (!caption) {
    console.error(`ERROR [${b.text}]: captionIdx ${b.captionIdx} not found`);
    errors++;
    continue;
  }

  // Validate context matches caption text
  const captionText = b.side === 0 ? caption.ko : caption.en;
  if (b.context !== captionText) {
    console.error(`WARN  [${b.text}]: context mismatch at idx ${b.captionIdx}`);
    console.error(`  context:  "${b.context}"`);
    console.error(`  caption:  "${captionText}"`);
    b.context = captionText;
    fixes++;
  }

  // Validate and auto-correct offset
  const actual = b.context.indexOf(b.text);
  if (actual === -1) {
    console.error(`ERROR [${b.text}]: not found in context "${b.context}"`);
    errors++;
    continue;
  }

  if (b.offset !== actual) {
    console.error(
      `FIX   [${b.text}]: offset ${b.offset} → ${actual} in "${b.context}"`,
    );
    b.offset = actual;
    fixes++;
  }
}

console.log(JSON.stringify(bookmarks, null, 2));
console.error(
  `\nValidated ${bookmarks.length} bookmarks: ${fixes} fixed, ${errors} errors`,
);

if (errors > 0) process.exit(1);
