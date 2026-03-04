// Convert seed/*.json to SQL and import to local D1.
// Usage: node scripts/db-seed.ts [--persist-to <path>]
// Reads all JSON files from scripts/seed/, generates SQL, and executes via wrangler.

import { execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";

interface SeedData {
  video: {
    youtubeId: string;
    title: string;
    channelName: string;
    channelId: string;
    duration: number;
    language1: string;
    language2: string;
  };
  captions: {
    idx: number;
    begin: number;
    end: number;
    ko: string;
    en: string;
  }[];
  bookmarks: {
    text: string;
    translation: string;
    captionIdx: number;
    side: number;
    offset: number;
    context: string;
    notes: string;
    status: string;
  }[];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function toSql(data: SeedData): string {
  const { video, captions, bookmarks } = data;
  const id = video.youtubeId;
  const lines: string[] = [];

  // Video
  lines.push(
    `INSERT INTO videos (youtube_id, title, channel_name, channel_id, duration, language1, language2)`,
    `VALUES ('${esc(id)}', '${esc(video.title)}', '${esc(video.channelName)}', '${esc(video.channelId)}', ${video.duration}, '${esc(video.language1)}', '${esc(video.language2)}');`,
    "",
  );

  // Captions per language
  for (const lang of [video.language1, video.language2]) {
    const rows = captions
      .filter((c) => c[lang as "ko" | "en"] !== "")
      .map(
        (c) =>
          `((SELECT id FROM videos WHERE youtube_id = '${esc(id)}'), '${lang}', ${c.idx}, ${c.begin}, ${c.end}, '${esc(c[lang as "ko" | "en"])}')`,
      );
    if (rows.length > 0) {
      lines.push(
        `INSERT INTO captions (video_id, language, idx, begin, end, text) VALUES`,
        rows.join(",\n") + ";",
        "",
      );
    }
  }

  // Bookmarks
  for (const b of bookmarks) {
    const cue = captions[b.captionIdx];
    const lang = b.side === 0 ? video.language1 : video.language2;
    lines.push(
      `INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, notes, status)`,
      `SELECT v.id, c.id, '${esc(b.text)}', ${b.side}, ${b.offset}, '${esc(b.translation)}', '${esc(b.context)}', ${cue.begin}, '${esc(b.notes)}', '${esc(b.status)}'`,
      `  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = '${lang}' AND c.idx = ${cue.idx}`,
      `  WHERE v.youtube_id = '${esc(id)}';`,
      "",
    );
  }

  return lines.join("\n");
}

// --- main ---

const args = process.argv.slice(2);
const persistIdx = args.indexOf("--persist-to");
const persistTo = persistIdx !== -1 ? args[persistIdx + 1] : undefined;

const seedDir = join(import.meta.dirname!, "seed");
const files = readdirSync(seedDir).filter((f) => f.endsWith(".json"));

if (files.length === 0) {
  console.error("No seed files found in scripts/seed/");
  process.exit(1);
}

const sql = files
  .map((f) => toSql(JSON.parse(readFileSync(join(seedDir, f), "utf-8"))))
  .join("\n");

const tmpFile = resolve(seedDir, ".seed.sql");
writeFileSync(tmpFile, sql);
try {
  const persistFlag = persistTo ? ` --persist-to ${persistTo}` : "";
  execSync(
    `npx wrangler d1 execute DB --local --file ${tmpFile}${persistFlag} -y`,
    {
      stdio: "inherit",
    },
  );
} finally {
  unlinkSync(tmpFile);
}
