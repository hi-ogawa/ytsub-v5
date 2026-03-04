// Generate seed SQL from video.json + captions.json + bookmarks.json
// Usage: node scripts/gen-seed-sql.ts <video.json> <captions.json> [bookmarks.json]
// Pure: no network calls. Outputs SQL to stdout.

import { readFileSync } from "fs";

interface Video {
  youtubeId: string;
  title: string;
  channelName: string;
  channelId: string;
  duration: number;
}

interface MergedCue {
  idx: number;
  begin: number;
  end: number;
  ko: string;
  en: string;
}

interface Bookmark {
  text: string;
  translation: string;
  captionIdx: number;
  side: number;
  offset: number;
  context: string;
  notes: string;
  status: string;
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

// --- main ---

const [videoPath, captionsPath, bookmarksPath] = process.argv.slice(2);
if (!videoPath || !captionsPath) {
  console.error(
    "Usage: node scripts/gen-seed-sql.ts <video.json> <captions.json> [bookmarks.json]",
  );
  process.exit(1);
}

const video: Video = JSON.parse(readFileSync(videoPath, "utf-8"));
const captions: MergedCue[] = JSON.parse(readFileSync(captionsPath, "utf-8"));
const bookmarks: Bookmark[] = bookmarksPath
  ? JSON.parse(readFileSync(bookmarksPath, "utf-8"))
  : [];

const id = video.youtubeId;
const lines: string[] = [];

// Video
lines.push(
  `INSERT INTO videos (youtube_id, title, channel_name, channel_id, duration, language1, language2)`,
  `VALUES ('${esc(id)}', '${esc(video.title)}', '${esc(video.channelName)}', '${esc(video.channelId)}', ${video.duration}, 'ko', 'en');`,
  "",
);

// Captions per language
for (const lang of ["ko", "en"] as const) {
  const rows = captions
    .filter((c) => c[lang] !== "")
    .map(
      (c) =>
        `((SELECT id FROM videos WHERE youtube_id = '${esc(id)}'), '${lang}', ${c.idx}, ${c.begin}, ${c.end}, '${esc(c[lang])}')`,
    );
  lines.push(
    `INSERT INTO captions (video_id, language, idx, begin, end, text) VALUES`,
    rows.join(",\n") + ";",
    "",
  );
}

// Bookmarks
for (const b of bookmarks) {
  const cue = captions[b.captionIdx];
  const lang = b.side === 0 ? "ko" : "en";
  lines.push(
    `INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, notes, status)`,
    `SELECT v.id, c.id, '${esc(b.text)}', ${b.side}, ${b.offset}, '${esc(b.translation)}', '${esc(b.context)}', ${cue.begin}, '${esc(b.notes)}', '${esc(b.status)}'`,
    `  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = '${lang}' AND c.idx = ${cue.idx}`,
    `  WHERE v.youtube_id = '${esc(id)}';`,
    "",
  );
}

console.log(lines.join("\n"));
