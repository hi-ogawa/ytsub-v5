// Assemble seed JSON from intermediate files (step 5).
// Usage: node scripts/gen-seed-json.ts <id>.video.json <id>.captions.json [<id>.bookmarks.json]
// Outputs unified seed JSON to stdout. Pipe to scripts/seed/<id>.json.

import { readFileSync } from "fs";

const [videoPath, captionsPath, bookmarksPath] = process.argv.slice(2);
if (!videoPath || !captionsPath) {
  console.error(
    "Usage: node scripts/gen-seed-json.ts <video.json> <captions.json> [bookmarks.json]",
  );
  process.exit(1);
}

const video = JSON.parse(readFileSync(videoPath, "utf-8"));
const captions = JSON.parse(readFileSync(captionsPath, "utf-8"));
const bookmarks = bookmarksPath
  ? JSON.parse(readFileSync(bookmarksPath, "utf-8"))
  : [];

const seed = {
  video: {
    youtubeId: video.youtubeId,
    title: video.title,
    channelName: video.channelName,
    channelId: video.channelId,
    duration: video.duration,
    language1: "ko",
    language2: "en",
  },
  captions,
  bookmarks,
};

console.log(JSON.stringify(seed, null, 2));
