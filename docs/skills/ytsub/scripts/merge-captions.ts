// Merge ko.json + en.json → captions.json (bilingual aligned captions)
// Usage: node scripts/merge-captions.ts <ko.json> <en.json>
//
// Korean timestamps are the source of truth. For each Korean cue, the English
// cue with the most timestamp overlap is paired. When no English cue overlaps,
// en is set to "".

import { readFileSync } from "fs";

interface Cue {
  begin: number;
  end: number;
  text: string;
}

interface MergedCaption {
  idx: number;
  begin: number;
  end: number;
  ko: string;
  en: string;
}

function overlap(a: Cue, b: Cue): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.begin, b.begin));
}

function merge(koCues: Cue[], enCues: Cue[]): MergedCaption[] {
  return koCues.map((ko, idx) => {
    let bestOv = 0;
    let bestText = "";

    for (const en of enCues) {
      const ov = overlap(ko, en);
      if (ov > bestOv) {
        bestOv = ov;
        bestText = en.text;
      }
    }

    return { idx, begin: ko.begin, end: ko.end, ko: ko.text, en: bestText };
  });
}

// CLI
const koFile = process.argv[2];
const enFile = process.argv[3];

if (!koFile || !enFile) {
  console.error("Usage: npx tsx merge-captions.ts <ko.json> <en.json>");
  process.exit(1);
}

const koCues = JSON.parse(readFileSync(koFile, "utf-8")) as Cue[];
const enCues = JSON.parse(readFileSync(enFile, "utf-8")) as Cue[];
const merged = merge(koCues, enCues);
console.log(JSON.stringify(merged, null, 2));
console.error(`Merged ${merged.length} captions`);
