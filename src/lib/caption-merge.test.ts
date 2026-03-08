import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  type CaptionCue,
  type MergedCaption,
  mergeBestOverlap,
  mergeBidirectional,
  mergeCaptions,
  mergeDTW,
  mergeOverlap,
  mergePartition,
  mergeRelaxedStrict,
  mergeStrict,
} from "./caption-merge";
import { parseJson3 } from "./youtube";

// === Helpers ===

function loadTrack(videoDir: string, filename: string): CaptionCue[] {
  const raw = JSON.parse(readFileSync(join(videoDir, filename), "utf-8"));
  return parseJson3(raw);
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
    expect(result![0]).toMatchObject({
      idx: 0,
      begin: 0,
      end: 2,
      text1: "안녕",
      text2: "hello",
      cue1Indices: [0],
      cue2Indices: [0],
    });
    expect(result![1]).toMatchObject({
      idx: 1,
      begin: 3,
      end: 5,
      text1: "세상",
      text2: "world",
      cue1Indices: [1],
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

  it("falls through to partition on count mismatch", () => {
    const cues1: CaptionCue[] = [
      { begin: 0, end: 5, text: "a" },
      { begin: 5, end: 10, text: "b" },
    ];
    const cues2: CaptionCue[] = [{ begin: 0, end: 10, text: "x" }];
    const result = mergeCaptions(cues1, cues2);
    expect(result.strategy).toBe("partition");
  });
});

// === Real data tests against scripts/youtube-json ===

const YOUTUBE_JSON_DIR = join(
  import.meta.dirname!,
  "../../scripts/youtube-json",
);

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

function mergeStats(merged: MergedCaption[], enCues: CaptionCue[]) {
  const rows = merged.length;
  const withText2 = merged.filter((m) => m.text2.length > 0).length;
  const withText1 = merged.filter((m) => m.text1.length > 0).length;
  const emptyText2 = rows - withText2;

  // Shared cue2s: how many cue2 indices are claimed by multiple rows
  const cue2Claimants = new Map<number, number>();
  for (const m of merged) {
    for (const j of m.cue2Indices) {
      cue2Claimants.set(j, (cue2Claimants.get(j) ?? 0) + 1);
    }
  }
  const sharedCue2s = [...cue2Claimants.values()].filter((c) => c > 1).length;

  // Dropped cue2s: not assigned to any row
  const assignedCue2s = new Set<number>();
  for (const m of merged) {
    for (const j of m.cue2Indices) assignedCue2s.add(j);
  }
  const droppedCue2s = enCues.length - assignedCue2s.size;

  return {
    rows,
    withText1,
    withText2,
    emptyText2,
    sharedCue2s,
    droppedCue2s,
  };
}

function loadVideo(videoId: string) {
  const videoDir = join(YOUTUBE_JSON_DIR, videoId);
  const koFile = findTrackFile(videoDir, "ko")!;
  const enFile = findTrackFile(videoDir, "en")!;
  return { ko: loadTrack(videoDir, koFile), en: loadTrack(videoDir, enFile) };
}

describe("strategy mapping stats", () => {
  const v1 = loadVideo("7GU_VQfgMT0");
  const v2 = loadVideo("DtK-CkwNHSY");

  describe("7GU_VQfgMT0", () => {
    it("cue counts", () => {
      expect({ ko: v1.ko.length, en: v1.en.length }).toMatchInlineSnapshot(`
        {
          "en": 56,
          "ko": 62,
        }
      `);
    });
    it("overlap", () => {
      expect(mergeStats(mergeOverlap(v1.ko, v1.en), v1.en))
        .toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 0,
          "rows": 62,
          "sharedCue2s": 42,
          "withText1": 62,
          "withText2": 62,
        }
      `);
    });
    it("best-overlap", () => {
      expect(mergeStats(mergeBestOverlap(v1.ko, v1.en), v1.en))
        .toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 0,
          "rows": 62,
          "sharedCue2s": 5,
          "withText1": 62,
          "withText2": 62,
        }
      `);
    });
    it("partition", () => {
      expect(mergeStats(mergePartition(v1.ko, v1.en), v1.en))
        .toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 0,
          "rows": 56,
          "sharedCue2s": 0,
          "withText1": 56,
          "withText2": 56,
        }
      `);
    });
    it("bidirectional", () => {
      expect(mergeStats(mergeBidirectional(v1.ko, v1.en), v1.en))
        .toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 6,
          "rows": 62,
          "sharedCue2s": 0,
          "withText1": 62,
          "withText2": 56,
        }
      `);
    });
    it("dtw", () => {
      expect(mergeStats(mergeDTW(v1.ko, v1.en), v1.en)).toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 6,
          "rows": 62,
          "sharedCue2s": 0,
          "withText1": 62,
          "withText2": 56,
        }
      `);
    });
  });

  describe("DtK-CkwNHSY", () => {
    it("cue counts", () => {
      expect({ ko: v2.ko.length, en: v2.en.length }).toMatchInlineSnapshot(`
        {
          "en": 40,
          "ko": 385,
        }
      `);
    });
    it("overlap", () => {
      expect(mergeStats(mergeOverlap(v2.ko, v2.en), v2.en))
        .toMatchInlineSnapshot(`
          {
            "droppedCue2s": 0,
            "emptyText2": 0,
            "rows": 385,
            "sharedCue2s": 40,
            "withText1": 385,
            "withText2": 385,
          }
        `);
    });
    it("best-overlap", () => {
      expect(mergeStats(mergeBestOverlap(v2.ko, v2.en), v2.en))
        .toMatchInlineSnapshot(`
          {
            "droppedCue2s": 0,
            "emptyText2": 0,
            "rows": 385,
            "sharedCue2s": 40,
            "withText1": 385,
            "withText2": 385,
          }
        `);
    });
    it("partition", () => {
      expect(mergeStats(mergePartition(v2.ko, v2.en), v2.en))
        .toMatchInlineSnapshot(`
          {
            "droppedCue2s": 0,
            "emptyText2": 0,
            "rows": 40,
            "sharedCue2s": 0,
            "withText1": 40,
            "withText2": 40,
          }
        `);
    });
    it("bidirectional", () => {
      expect(mergeStats(mergeBidirectional(v2.ko, v2.en), v2.en))
        .toMatchInlineSnapshot(`
          {
            "droppedCue2s": 0,
            "emptyText2": 345,
            "rows": 385,
            "sharedCue2s": 0,
            "withText1": 385,
            "withText2": 40,
          }
        `);
    });
    it("dtw", () => {
      expect(mergeStats(mergeDTW(v2.ko, v2.en), v2.en)).toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 345,
          "rows": 385,
          "sharedCue2s": 0,
          "withText1": 385,
          "withText2": 40,
        }
      `);
    });
  });
});
