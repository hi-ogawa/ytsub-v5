// Generate seed SQL from import.json files.
// Usage: node scripts/db-seed-gen.ts scripts/db-seed-json/*/import.json > scripts/db-seed.sql
// Creates a seed user and assigns all data to it.

import { readFileSync } from "fs";
import { hashPassword } from "../src/lib/password.ts";

interface ImportData {
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
    text1: string;
    text2: string;
  }[];
  bookmarks: {
    text: string;
    translation: string;
    captionIdx: number;
    side: number;
    offset: number;
    context: string;
    etymology?: string;
    notes?: string;
    status?: string;
  }[];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function toSql(data: ImportData): string {
  const { video, captions, bookmarks } = data;
  const id = video.youtubeId;
  const lines: string[] = [];

  lines.push(
    `INSERT INTO videos (user_id, youtube_id, title, channel_name, channel_id, duration, language1, language2)`,
    `VALUES ((SELECT id FROM users WHERE username = 'dev'), '${esc(id)}', '${esc(video.title)}', '${esc(video.channelName)}', '${esc(video.channelId)}', ${video.duration}, '${esc(video.language1)}', '${esc(video.language2)}');`,
    "",
  );

  if (captions.length > 0) {
    const rows = captions.map(
      (c) =>
        `((SELECT id FROM videos WHERE youtube_id = '${esc(id)}'), ${c.idx}, ${c.begin}, ${c.end}, '${esc(c.text1)}', '${esc(c.text2)}')`,
    );
    lines.push(
      `INSERT INTO captions (video_id, idx, begin, end, text1, text2) VALUES`,
      rows.join(",\n") + ";",
      "",
    );
  }

  for (const b of bookmarks) {
    const cue = captions[b.captionIdx];
    lines.push(
      `INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, etymology, notes, status)`,
      `SELECT v.id, c.id, '${esc(b.text)}', ${b.side}, ${b.offset}, '${esc(b.translation)}', '${esc(b.context)}', ${cue.begin}, '${esc(b.etymology ?? "")}', '${esc(b.notes ?? "")}', '${esc(b.status ?? "pending")}'`,
      `  FROM videos v JOIN captions c ON c.video_id = v.id AND c.idx = ${b.captionIdx}`,
      `  WHERE v.youtube_id = '${esc(id)}';`,
      "",
    );
  }

  return lines.join("\n");
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error(
    "Usage: node scripts/db-seed-gen.ts docs/skills/ytsub/data/*/import.json",
  );
  process.exit(1);
}

const devPasswordHash = await hashPassword(
  "devpassword",
  new Uint8Array(16).fill(0) as Uint8Array<ArrayBuffer>,
);
// Seed user first, then video data
const seedUser = `INSERT OR IGNORE INTO users (username, password_hash) VALUES ('dev', '${devPasswordHash}');\n`;
const sql =
  seedUser +
  files.map((f) => toSql(JSON.parse(readFileSync(f, "utf-8")))).join("\n");
console.log(sql);
