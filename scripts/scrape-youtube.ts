/**
 * Scrape YouTube video metadata + subtitle tracks to fixture files.
 *
 * Usage:
 *   node scripts/scrape-youtube.ts <videoId> [videoId2 ...]
 *
 * Output:
 *   scripts/youtube-json/<videoId>/metadata.json   — YouTubeExtractionResult
 *   scripts/youtube-json/<videoId>/track-<vssId>.json    — json3 for each track
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { fetchPlayerApi, fetchTrackJson3 } from "../src/lib/youtube.ts";

const FIXTURES_DIR = join(import.meta.dirname, "youtube-json");

async function scrape(videoId: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: "domcontentloaded",
    });

    const result = await page.evaluate(fetchPlayerApi, videoId);
    const dir = join(FIXTURES_DIR, videoId);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(`[${videoId}] metadata: ${result.captionTracks.length} tracks`);

    for (const track of result.captionTracks) {
      const json3 = await page.evaluate(fetchTrackJson3, track.baseUrl);
      const filename = `track-${track.vssId}.json`;
      await writeFile(join(dir, filename), JSON.stringify(json3, null, 2));
      console.log(
        `[${videoId}] ${track.vssId} (${track.languageCode}): ${json3.events?.length ?? 0} events`,
      );
    }
  } finally {
    await browser.close();
  }
}

const videoIds = process.argv.slice(2);
if (videoIds.length === 0) {
  console.error("Usage: node scripts/scrape-youtube.ts <videoId> [...]");
  process.exit(1);
}

for (const id of videoIds) {
  await scrape(id);
}
