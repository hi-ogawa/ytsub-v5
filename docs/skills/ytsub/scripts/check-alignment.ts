// Check if two parsed cue files (ko.json, en.json) have 1:1 alignment.
// If aligned, outputs merged captions.json to stdout.
// Usage: npx tsx check-alignment.ts <ko.json> <en.json> [--tolerance 0.5]
//
// "Aligned" means: same cue count and every begin timestamp matches
// within tolerance (default 0.5s).
//
// Exit codes:
//   0 — aligned, merged captions.json written to stdout
//   1 — not aligned (details on stderr)

import { readFileSync } from "fs";

interface Cue {
  language: string;
  idx: number;
  begin: number;
  end: number;
  text: string;
}

const args = process.argv.slice(2);
let tolerance = 0.5;

const tolIdx = args.indexOf("--tolerance");
if (tolIdx !== -1) {
  tolerance = Number(args[tolIdx + 1]);
  args.splice(tolIdx, 2);
}

const [file1, file2] = args;

if (!file1 || !file2) {
  console.error(
    "Usage: npx tsx check-alignment.ts <lang1.json> <lang2.json> [--tolerance 0.5]",
  );
  process.exit(1);
}

const cues1 = JSON.parse(readFileSync(file1, "utf-8")) as Cue[];
const cues2 = JSON.parse(readFileSync(file2, "utf-8")) as Cue[];

if (cues1.length !== cues2.length) {
  console.error(
    `NOT ALIGNED: count mismatch (${cues1.length} vs ${cues2.length})`,
  );
  process.exit(1);
}

const mismatches: { idx: number; begin1: number; begin2: number }[] = [];
for (let i = 0; i < cues1.length; i++) {
  if (Math.abs(cues1[i].begin - cues2[i].begin) > tolerance) {
    mismatches.push({
      idx: i,
      begin1: cues1[i].begin,
      begin2: cues2[i].begin,
    });
  }
}

if (mismatches.length > 0) {
  console.error(
    `NOT ALIGNED: ${mismatches.length}/${cues1.length} cues exceed ${tolerance}s tolerance`,
  );
  for (const m of mismatches.slice(0, 10)) {
    console.error(
      `  idx ${m.idx}: ${m.begin1.toFixed(3)} vs ${m.begin2.toFixed(3)} (Δ${Math.abs(m.begin1 - m.begin2).toFixed(3)}s)`,
    );
  }
  if (mismatches.length > 10) {
    console.error(`  ... and ${mismatches.length - 10} more`);
  }
  process.exit(1);
}

// Aligned — merge into captions.json format using lang1 timestamps
const merged = cues1.map((c1, i) => ({
  idx: i,
  begin: c1.begin,
  end: c1.end,
  text1: c1.text,
  text2: cues2[i].text,
}));

console.log(JSON.stringify(merged, null, 2));
console.error(
  `ALIGNED: ${cues1.length} cues, max Δ${Math.max(...cues1.map((c, i) => Math.abs(c.begin - cues2[i].begin))).toFixed(3)}s — merged captions.json written to stdout`,
);
