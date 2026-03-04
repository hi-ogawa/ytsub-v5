// Parse TTML subtitle file → caption cues JSON (for createCaptions API)
// Usage: node docs/skills/ytsub/scripts/parse-ttml.ts <file.ttml> [language]

import { readFileSync } from "fs";

interface CaptionCue {
  language: string;
  idx: number;
  begin: number;
  end: number;
  text: string;
}

function parseTimestamp(text: string): number {
  const [h, m, s] = text.split(":").map(Number);
  return (h * 60 + m) * 60 + s;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTtml(ttml: string, language: string): CaptionCue[] {
  const re = /<p[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>(.*?)<\/p>/gs;
  const cues: CaptionCue[] = [];
  let idx = 0;

  for (const match of ttml.matchAll(re)) {
    const text = decodeEntities(
      match[3].replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, ""),
    ).trim();
    if (!text) continue;

    cues.push({
      language,
      idx: idx++,
      begin: parseTimestamp(match[1]),
      end: parseTimestamp(match[2]),
      text,
    });
  }
  return cues;
}

// CLI
const file = process.argv[2];
const language =
  process.argv[3] ?? file?.match(/\.([a-zA-Z-]+)\.ttml$/)?.[1] ?? "ko";

if (!file) {
  console.error("Usage: npx tsx parse-ttml.ts <file.ttml> [language]");
  process.exit(1);
}

const ttml = readFileSync(file, "utf-8");
const cues = parseTtml(ttml, language);
console.log(JSON.stringify(cues, null, 2));
console.error(`Parsed ${cues.length} cues (language: ${language})`);
