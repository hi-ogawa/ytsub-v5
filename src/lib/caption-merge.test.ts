import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  type CaptionCue,
  type MergedCaption,
  mergeBidirectional,
  mergeCaptions,
  mergeDTW,
  mergeOverlap,
  mergeRelaxedStrict,
  mergeStrict,
} from "./caption-merge";

// === Helpers ===

function parseJson3(data: {
  events: Array<{
    tStartMs: number;
    dDurationMs: number;
    segs?: Array<{ utf8: string }>;
  }>;
}): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const event of data.events) {
    if (!event.segs || !event.dDurationMs) continue;
    const text = event.segs
      .map((s) => s.utf8)
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      begin: event.tStartMs / 1000,
      end: (event.tStartMs + event.dDurationMs) / 1000,
      text,
    });
  }
  return cues;
}

function loadTrack(videoDir: string, filename: string): CaptionCue[] {
  const raw = JSON.parse(readFileSync(join(videoDir, filename), "utf-8"));
  return parseJson3(raw);
}

// Count how many merged rows have non-empty text2
function coveragePercent(merged: MergedCaption[]): number {
  if (merged.length === 0) return 0;
  const withText2 = merged.filter((m) => m.text2.length > 0).length;
  return (withText2 / merged.length) * 100;
}

// Check that no text2 value appears in more than one row (dedup check)
function duplicateText2Count(merged: MergedCaption[]): number {
  const seen = new Map<string, number>();
  let dupes = 0;
  for (const m of merged) {
    if (!m.text2) continue;
    const count = (seen.get(m.text2) ?? 0) + 1;
    seen.set(m.text2, count);
    if (count > 1) dupes++;
  }
  return dupes;
}

// === Unit tests with synthetic data ===

describe("mergeStrict", () => {
  it("merges identical timestamps", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 2, text: "안녕" },
      { begin: 3, end: 5, text: "세상" },
    ];
    const cues2: CaptionCue[] = [
      { begin: 0, end: 2, text: "hello" },
      { begin: 3, end: 5, text: "world" },
    ];
    const result = mergeStrict(cues1, cues2);
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({
      idx: 0,
      begin: 0,
      end: 2,
      text1: "안녕",
      text2: "hello",
      cue2Indices: [0],
    });
    expect(result![1]).toEqual({
      idx: 1,
      begin: 3,
      end: 5,
      text1: "세상",
      text2: "world",
      cue2Indices: [1],
    });
  });

  it("merges within tolerance", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 2, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 0.3, end: 2.1, text: "b" }];
    expect(mergeStrict(cues1, cues2, 0.5)).toBeDefined();
  });

  it("rejects count mismatch", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 2, text: "a" },
      { begin: 3, end: 5, text: "b" },
    ];
    const cues2: CaptionCue[] = [{ begin: 0, end: 2, text: "x" }];
    expect(mergeStrict(cues1, cues2)).toBeUndefined();
  });

  it("rejects timestamp mismatch beyond tolerance", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 2, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 1, end: 3, text: "b" }];
    expect(mergeStrict(cues1, cues2, 0.5)).toBeUndefined();
  });
});

describe("mergeRelaxedStrict", () => {
  it("accepts larger timestamp drift", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 3, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 1.5, end: 4, text: "b" }];
    const result = mergeRelaxedStrict(cues1, cues2);
    expect(result).toBeDefined();
    expect(result![0].text1).toBe("a");
    expect(result![0].text2).toBe("b");
  });

  it("rejects drift > 2s", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 3, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 2.5, end: 5, text: "b" }];
    expect(mergeRelaxedStrict(cues1, cues2)).toBeUndefined();
  });
});

describe("mergeOverlap", () => {
  it("matches by time overlap", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 5, text: "first" },
      { begin: 6, end: 10, text: "second" },
    ];
    const cues2: CaptionCue[] = [
      { begin: 1, end: 4, text: "uno" },
      { begin: 7, end: 9, text: "dos" },
    ];
    const result = mergeOverlap(cues1, cues2);
    expect(result).toHaveLength(2);
    expect(result[0].text2).toBe("uno");
    expect(result[1].text2).toBe("dos");
  });

  it("concatenates multiple overlapping cues (>= 2s)", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 10, text: "long" }];
    const cues2: CaptionCue[] = [
      { begin: 0, end: 4, text: "part1" },
      { begin: 4, end: 8, text: "part2" },
      { begin: 8, end: 10, text: "part3" },
    ];
    const result = mergeOverlap(cues1, cues2);
    expect(result[0].text2).toBe("part1 part2 part3");
  });

  it("handles no overlap → orphan cue2 becomes extra row", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 2, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 5, end: 7, text: "b" }];
    const result = mergeOverlap(cues1, cues2);
    expect(result).toHaveLength(2);
    // First row: cue1 with no match
    expect(result[0].text1).toBe("a");
    expect(result[0].text2).toBe("");
    // Second row: orphan cue2 with empty text1
    expect(result[1].text1).toBe("");
    expect(result[1].text2).toBe("b");
    expect(result[1].begin).toBe(5);
    expect(result[1].end).toBe(7);
  });
});

describe("mergeBidirectional", () => {
  it("deduplicates: each cue2 assigned to one cue1", () => {
    // Two cue1s overlap with the same cue2 — only the best match gets it
    const cues1: CaptionCue[] = [
      { begin: 0, end: 3, text: "a" },
      { begin: 2, end: 5, text: "b" },
    ];
    const cues2: CaptionCue[] = [{ begin: 1, end: 4, text: "x" }];
    const result = mergeBidirectional(cues1, cues2);
    // "x" should appear in exactly one row
    const withX = result.filter((r) => r.text2 === "x");
    expect(withX).toHaveLength(1);
  });

  it("assigns cue2 to cue1 with best overlap", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 2, text: "a" },
      { begin: 1, end: 5, text: "b" },
    ];
    const cues2: CaptionCue[] = [{ begin: 1, end: 4, text: "x" }];
    const result = mergeBidirectional(cues1, cues2);
    // cue2 overlaps 1s with cue1[0] (1..2) and 3s with cue1[1] (1..4) → assigned to b
    expect(result[0].text2).toBe("");
    expect(result[1].text2).toBe("x");
  });
});

describe("mergeDTW", () => {
  it("aligns perfectly matched cues", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 2, text: "a" },
      { begin: 3, end: 5, text: "b" },
    ];
    const cues2: CaptionCue[] = [
      { begin: 0, end: 2, text: "x" },
      { begin: 3, end: 5, text: "y" },
    ];
    const result = mergeDTW(cues1, cues2);
    expect(result[0].text2).toBe("x");
    expect(result[1].text2).toBe("y");
  });

  it("handles 1:N merge (one cue1 matches multiple cue2s)", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 10, text: "long" }];
    const cues2: CaptionCue[] = [
      { begin: 0, end: 3, text: "p1" },
      { begin: 3, end: 6, text: "p2" },
      { begin: 6, end: 10, text: "p3" },
    ];
    const result = mergeDTW(cues1, cues2);
    expect(result).toHaveLength(1);
    expect(result[0].text2).toContain("p1");
    expect(result[0].text2).toContain("p2");
    expect(result[0].text2).toContain("p3");
  });

  it("handles empty cues2", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 2, text: "a" }];
    const result = mergeDTW(cues1, []);
    expect(result).toHaveLength(1);
    expect(result[0].text2).toBe("");
  });

  it("handles empty cues1", () => {
    const result = mergeDTW([], [{ begin: 0, end: 2, text: "x" }]);
    expect(result).toHaveLength(0);
  });
});

describe("mergeCaptions (tiered)", () => {
  it("uses strict when timestamps match exactly", () => {
    const cues1: CaptionCue[] = [{ begin: 0, end: 2, text: "a" }];
    const cues2: CaptionCue[] = [{ begin: 0, end: 2, text: "x" }];
    const result = mergeCaptions(cues1, cues2);
    expect(result.strategy).toBe("strict");
  });

  it("falls through to overlap on count mismatch", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 5, text: "a" },
      { begin: 5, end: 10, text: "b" },
    ];
    const cues2: CaptionCue[] = [{ begin: 0, end: 10, text: "x" }];
    const result = mergeCaptions(cues1, cues2);
    expect(result.strategy).toBe("overlap");
  });
});

// === Real data tests against scripts/youtube-json ===

const YOUTUBE_JSON_DIR = join(
  import.meta.dirname!,
  "../../scripts/youtube-json",
);

function getVideoIds(): string[] {
  try {
    return readdirSync(YOUTUBE_JSON_DIR).filter((d) => !d.startsWith("."));
  } catch {
    return [];
  }
}

function findTrackFile(
  videoDir: string,
  langPrefix: string,
): string | undefined {
  const files = readdirSync(videoDir);
  // Prefer manual (track-.<lang>) over auto (track-a.<lang>)
  return (
    files.find((f) => f.startsWith(`track-.${langPrefix}`)) ??
    files.find((f) => f.startsWith(`track-a.${langPrefix}`))
  );
}

describe("real YouTube data", () => {
  const videoIds = getVideoIds();

  for (const videoId of videoIds) {
    const videoDir = join(YOUTUBE_JSON_DIR, videoId);
    const koFile = findTrackFile(videoDir, "ko");
    const enFile = findTrackFile(videoDir, "en");

    if (!koFile || !enFile) continue;

    describe(videoId, () => {
      let koCues: CaptionCue[];
      let enCues: CaptionCue[];

      // Load once per video
      koCues = loadTrack(videoDir, koFile);
      enCues = loadTrack(videoDir, enFile);

      it("has parsed cues", () => {
        expect(koCues.length).toBeGreaterThan(0);
        expect(enCues.length).toBeGreaterThan(0);
      });

      it("mergeCaptions produces output", () => {
        const result = mergeCaptions(koCues, enCues);
        expect(result.captions.length).toBeGreaterThanOrEqual(koCues.length);
        // Every row should have at least text1 or text2
        for (const c of result.captions) {
          expect(c.text1.length + c.text2.length).toBeGreaterThan(0);
        }
      });

      it("mergeOverlap coverage", () => {
        const merged = mergeOverlap(koCues, enCues);
        const cov = coveragePercent(merged);
        expect(cov).toBeGreaterThan(0);
      });

      it("mergeBidirectional produces output", () => {
        const merged = mergeBidirectional(koCues, enCues);
        expect(merged.length).toBe(koCues.length);
      });

      it("mergeDTW coverage", () => {
        const merged = mergeDTW(koCues, enCues);
        const cov = coveragePercent(merged);
        expect(cov).toBeGreaterThan(0);
      });

      it("all strategies produce correct idx sequence", () => {
        for (const merge of [mergeOverlap, mergeBidirectional, mergeDTW]) {
          const merged = merge(koCues, enCues);
          merged.forEach((m, i) => expect(m.idx).toBe(i));
        }
      });

      it("strategy comparison summary", () => {
        const strict = mergeStrict(koCues, enCues);
        const relaxed = mergeRelaxedStrict(koCues, enCues);
        const overlap = mergeOverlap(koCues, enCues);
        const bidir = mergeBidirectional(koCues, enCues);
        const dtw = mergeDTW(koCues, enCues);

        const summary = {
          videoId,
          koCues: koCues.length,
          enCues: enCues.length,
          strict: strict ? "pass" : "fail",
          relaxed: relaxed ? "pass" : "fail",
          overlapCoverage: coveragePercent(overlap).toFixed(1) + "%",
          overlapDupes: duplicateText2Count(overlap),
          bidirCoverage: coveragePercent(bidir).toFixed(1) + "%",
          bidirDupes: duplicateText2Count(bidir),
          dtwCoverage: coveragePercent(dtw).toFixed(1) + "%",
          dtwDupes: duplicateText2Count(dtw),
        };

        // Print summary for manual review
        console.log("\n" + JSON.stringify(summary, null, 2));

        // DTW should have decent coverage
        expect(coveragePercent(dtw)).toBeGreaterThan(30);
      });
    });
  }
});
