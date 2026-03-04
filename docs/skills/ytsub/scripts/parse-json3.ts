// Parse yt-dlp json3 subtitle file → caption cues JSON
// Usage: node scripts/parse-json3.ts <file.json3> [language]

import { readFileSync } from "fs";

interface CaptionCue {
  language: string;
  idx: number;
  begin: number;
  end: number;
  text: string;
}

interface Json3Event {
  tStartMs: number;
  dDurationMs: number;
  segs?: { utf8: string }[];
}

interface Json3File {
  events: Json3Event[];
}

function parseJson3(data: Json3File, language: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let idx = 0;

  for (const event of data.events) {
    if (!event.segs || !event.dDurationMs) continue;

    const text = event.segs
      .map((s) => s.utf8)
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;

    cues.push({
      language,
      idx: idx++,
      begin: event.tStartMs / 1000,
      end: (event.tStartMs + event.dDurationMs) / 1000,
      text,
    });
  }
  return cues;
}

// CLI
const file = process.argv[2];
const language =
  process.argv[3] ?? file?.match(/([a-zA-Z-]+)\.json3$/)?.[1] ?? "ko";

if (!file) {
  console.error("Usage: npx tsx parse-json3.ts <file.json3> [language]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf-8")) as Json3File;
const cues = parseJson3(raw, language);
console.log(JSON.stringify(cues, null, 2));
console.error(`Parsed ${cues.length} cues (language: ${language})`);
