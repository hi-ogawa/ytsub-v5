// Visual preview of caption merging against youtube-json test data.
// Usage: npx tsx scripts/caption-merge-preview.ts <videoId> [strategy]
//
// Strategies: strict, relaxed, overlap, best-overlap, partition, bidirectional, dtw, tiered (default)
//
// Example:
//   node scripts/caption-merge-preview.ts 7GU_VQfgMT0
//   node scripts/caption-merge-preview.ts DtK-CkwNHSY overlap
//   node scripts/caption-merge-preview.ts 7GU_VQfgMT0 overlap --json

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  type MergedCaption,
  mergeBestOverlap,
  mergeBidirectional,
  mergeCaptions,
  mergeDTW,
  mergeOverlap,
  mergePartition,
  mergeRelaxedStrict,
  mergeStrict,
} from "../src/lib/caption-merge.ts";
import {
  type CaptionCue,
  type Json3File,
  parseJson3,
} from "../src/lib/youtube.ts";

// --- helpers ---

function loadJson3File(path: string): Json3File {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadTrackFile(path: string): CaptionCue[] {
  return parseJson3(loadJson3File(path));
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, " ")}:${s}`;
}

// --- main ---

function main() {
  const YOUTUBE_JSON_DIR = join(
    import.meta.dirname!,
    "../scripts/youtube-json",
  );

  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  const videoId = positional[0];
  const strategyName = positional[1] ?? "tiered";

  if (!videoId) {
    const available = readdirSync(YOUTUBE_JSON_DIR).filter(
      (d) => !d.startsWith("."),
    );
    console.error(
      "Usage: npx tsx scripts/caption-merge-preview.ts <videoId> [strategy] [--json]",
    );
    console.error(`\nAvailable videos: ${available.join(", ")}`);
    console.error(
      "Strategies: strict, relaxed, overlap, best-overlap, partition, bidirectional, dtw, tiered",
    );
    process.exit(1);
  }

  const videoDir = join(YOUTUBE_JSON_DIR, videoId);
  const files = readdirSync(videoDir);

  const koFile =
    files.find((f) => f.startsWith("track-.ko")) ??
    files.find((f) => f.startsWith("track-a.ko"));
  const enFile =
    files.find((f) => f.startsWith("track-.en")) ??
    files.find((f) => f.startsWith("track-a.en"));

  if (!koFile || !enFile) {
    console.error(`Missing ko or en track in ${videoDir}`);
    console.error(`Files: ${files.join(", ")}`);
    process.exit(1);
  }

  const koPath = join(videoDir, koFile);
  const enPath = join(videoDir, enFile);
  const koCues = loadTrackFile(koPath);
  const enCues = loadTrackFile(enPath);
  // Derive vssId from filename: "track-<vssId>.json" → "<vssId>"
  const koVssId = koFile.replace(/^track-/, "").replace(/\.json$/, "");
  const enVssId = enFile.replace(/^track-/, "").replace(/\.json$/, "");

  const { merged, usedStrategy } = runMerge(koCues, enCues, strategyName, {
    koJson3: loadJson3File(koPath),
    enJson3: loadJson3File(enPath),
    koVssId,
    enVssId,
  });

  if (jsonMode) {
    console.log(JSON.stringify(merged, null, 2));
    return;
  }

  console.log(`Video: ${videoId}`);
  console.log(`Ko: ${koFile} (${koCues.length} cues)`);
  console.log(`En: ${enFile} (${enCues.length} cues)`);
  console.log(`Strategy: ${strategyName}`);
  console.log();
  console.log(`Result: ${usedStrategy}, ${merged.length} rows\n`);

  printTable(merged);
  printStats(merged, enCues);
}

function runMerge(
  koCues: CaptionCue[],
  enCues: CaptionCue[],
  strategyName: string,
  raw: {
    koJson3: Json3File;
    enJson3: Json3File;
    koVssId: string;
    enVssId: string;
  },
): { merged: MergedCaption[]; usedStrategy: string } {
  switch (strategyName) {
    case "strict": {
      const r = mergeStrict(koCues, enCues);
      if (!r) {
        console.error("Strict merge failed (count or timestamp mismatch)");
        process.exit(1);
      }
      return { merged: r, usedStrategy: "strict" };
    }
    case "relaxed": {
      const r = mergeRelaxedStrict(koCues, enCues);
      if (!r) {
        console.error("Relaxed strict merge failed");
        process.exit(1);
      }
      return { merged: r, usedStrategy: "relaxed" };
    }
    case "overlap":
      return { merged: mergeOverlap(koCues, enCues), usedStrategy: "overlap" };
    case "best-overlap":
      return {
        merged: mergeBestOverlap(koCues, enCues),
        usedStrategy: "best-overlap",
      };
    case "partition":
      return {
        merged: mergePartition(koCues, enCues),
        usedStrategy: "partition",
      };
    case "bidirectional":
      return {
        merged: mergeBidirectional(koCues, enCues),
        usedStrategy: "bidirectional",
      };
    case "dtw":
      return { merged: mergeDTW(koCues, enCues), usedStrategy: "dtw" };
    case "tiered": {
      const r = mergeCaptions(
        { json3: raw.koJson3, vssId: raw.koVssId },
        { json3: raw.enJson3, vssId: raw.enVssId },
      );
      return { merged: r.captions, usedStrategy: r.strategy };
    }
    default:
      console.error(`Unknown strategy: ${strategyName}`);
      process.exit(1);
  }
}

function printTable(merged: MergedCaption[]) {
  // Build duplicate map: cue2 index → list of row indices that claim it
  const cue2Claimants = new Map<number, number[]>();
  for (const row of merged) {
    for (const j of row.cue2Indices) {
      if (!cue2Claimants.has(j)) cue2Claimants.set(j, []);
      cue2Claimants.get(j)!.push(row.idx);
    }
  }

  const sharedCue2s = new Set<number>();
  for (const [j, claimants] of cue2Claimants) {
    if (claimants.length > 1) sharedCue2s.add(j);
  }

  function dupeMarker(row: MergedCaption): string {
    if (row.cue2Indices.length === 0) return "";
    const shared = row.cue2Indices.filter((j) => sharedCue2s.has(j));
    if (shared.length === 0) return "";
    const others = new Set<number>();
    for (const j of shared) {
      for (const claimant of cue2Claimants.get(j)!) {
        if (claimant !== row.idx) others.add(claimant);
      }
    }
    return `= ${[...others].join(",")}`;
  }

  interface Row {
    idx: string;
    time: string;
    ko: string;
    en: string;
    cue2: string;
    dupes: string;
  }

  const rows: Row[] = merged.map((row) => ({
    idx: String(row.idx),
    time: `${fmt(row.begin)}–${fmt(row.end)}`,
    ko: row.text1,
    en: row.text2 || "—",
    cue2: row.cue2Indices.length > 0 ? row.cue2Indices.join(",") : "—",
    dupes: dupeMarker(row),
  }));

  const cols: (keyof Row)[] = ["idx", "time", "ko", "en", "cue2", "dupes"];
  const headers: Record<keyof Row, string> = {
    idx: "#",
    time: "time",
    ko: "ko",
    en: "en",
    cue2: "cue2",
    dupes: "dupes",
  };

  const widths: Record<string, number> = {};
  for (const col of cols) {
    widths[col] = Math.max(
      headers[col].length,
      ...rows.map((r) => r[col].length),
    );
  }

  function pad(s: string, col: keyof Row): string {
    return s.padEnd(widths[col]);
  }

  console.log(`| ${cols.map((c) => pad(headers[c], c)).join(" | ")} |`);
  console.log(`| ${cols.map((c) => "-".repeat(widths[c])).join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${cols.map((c) => pad(row[c], c)).join(" | ")} |`);
  }
}

function printStats(merged: MergedCaption[], enCues: CaptionCue[]) {
  const withEn = merged.filter((m) => m.text2.length > 0).length;
  const empty = merged.length - withEn;

  const assignedCue2s = new Set<number>();
  const cue2Claimants = new Map<number, number[]>();
  for (const row of merged) {
    for (const j of row.cue2Indices) {
      assignedCue2s.add(j);
      if (!cue2Claimants.has(j)) cue2Claimants.set(j, []);
      cue2Claimants.get(j)!.push(row.idx);
    }
  }

  const sharedCount = [...cue2Claimants.values()].filter(
    (c) => c.length > 1,
  ).length;

  console.log();
  console.log(
    `Coverage: ${withEn}/${merged.length} rows have English (${((withEn / merged.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Empty:    ${empty} rows without English`);
  console.log(`Shared:   ${sharedCount} cue2s claimed by multiple rows`);

  const dropped: number[] = [];
  for (let j = 0; j < enCues.length; j++) {
    if (!assignedCue2s.has(j)) dropped.push(j);
  }
  if (dropped.length > 0) {
    console.log(`Dropped:  ${dropped.length} cue2s not assigned to any row\n`);
    for (const j of dropped) {
      const c = enCues[j];
      console.log(`  cue2[${j}] ${fmt(c.begin)}–${fmt(c.end)}  ${c.text}`);
    }
  }
}

main();
