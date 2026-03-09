/**
 * Scrape YouTube video metadata + subtitle tracks to fixture files.
 *
 * Usage:
 *   node scripts/scrape-youtube.ts <videoId> [videoId2 ...]
 *
 * Output:
 *   scripts/youtube-json/<videoId>/metadata.json   — YouTubeExtractionResult
 *   scripts/youtube-json/<videoId>/track-<vssId>.json    — json3 for each track
 *
 * Also fetches auto-translated versions for configured target languages
 * when a native track doesn't exist (e.g. Korean → English, Japanese).
 * Prefers manual tracks over ASR as the translation source.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  type YouTubeCaptionTrack,
  type YouTubeExtractionResult,
  fetchPlayerApi,
  fetchTrackJson3,
} from "../src/lib/youtube.ts";

const FIXTURES_DIR = join(import.meta.dirname, "youtube-json");

/** Source language → target languages to auto-translate into. */
const TRANSLATION_TARGETS: Record<string, string[]> = {
  ko: ["en", "ja"],
};

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

    // Fetch native tracks
    for (const track of result.captionTracks) {
      const json3 = await page.evaluate(fetchTrackJson3, track.baseUrl);
      const filename = `track-${track.vssId}.json`;
      await writeFile(join(dir, filename), JSON.stringify(json3, null, 2));
      console.log(
        `[${videoId}] ${track.vssId} (${track.languageCode}): ${json3.events?.length ?? 0} events`,
      );
    }

    // Fetch auto-translations for missing languages.
    // For each source language with configured targets, pick the best
    // source track (manual over ASR) and translate into missing languages.
    const translatedTracks: YouTubeCaptionTrack[] = [];
    const coveredLangs = new Set(
      result.captionTracks.map((t) => t.languageCode),
    );

    for (const [srcLang, targets] of Object.entries(TRANSLATION_TARGETS)) {
      // Pick best source: prefer manual (kind absent) over ASR
      const sourceCandidates = result.captionTracks.filter(
        (t) => t.languageCode === srcLang,
      );
      const source =
        sourceCandidates.find((t) => !t.kind) ??
        sourceCandidates.find((t) => t.kind === "asr");
      if (!source) continue;

      for (const tlang of targets) {
        if (coveredLangs.has(tlang)) continue;

        const url = new URL(source.baseUrl);
        url.searchParams.set("tlang", tlang);
        const vssId = `${source.vssId}.t.${tlang}`;

        try {
          const translated = await page.evaluate(
            fetchTrackJson3,
            url.toString(),
          );
          const tFilename = `track-${vssId}.json`;
          await writeFile(
            join(dir, tFilename),
            JSON.stringify(translated, null, 2),
          );
          console.log(
            `[${videoId}] ${vssId} (${tlang} translated from ${source.vssId}): ${translated.events?.length ?? 0} events`,
          );

          translatedTracks.push({
            baseUrl: url.toString(),
            languageCode: tlang,
            kind: "asr",
            name: `${tlang} (auto-translated from ${source.vssId})`,
            vssId,
          });
          coveredLangs.add(tlang);
        } catch (e) {
          console.warn(
            `[${videoId}] ${vssId}: translation fetch failed — ${e}`,
          );
        }
      }
    }

    // Save metadata with translated tracks included
    const fullResult: YouTubeExtractionResult = {
      ...result,
      captionTracks: [...result.captionTracks, ...translatedTracks],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(fullResult, null, 2),
    );
    console.log(
      `[${videoId}] metadata: ${result.captionTracks.length} native + ${translatedTracks.length} translated tracks`,
    );
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
