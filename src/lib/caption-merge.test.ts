import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  type MergedCaption,
  mergeCaptions,
  mergePartition,
  mergeRelaxedStrict,
  mergeStrict,
} from "./caption-merge";
import { type CaptionCue, type Json3File, parseJson3 } from "./youtube";

// === Helpers ===

function loadJson3(videoDir: string, filename: string): Json3File {
  return JSON.parse(readFileSync(join(videoDir, filename), "utf-8"));
}

function loadTrack(videoDir: string, filename: string): CaptionCue[] {
  return parseJson3(loadJson3(videoDir, filename));
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

/** Helper: wrap cues as a minimal Json3File for mergeCaptions TrackInput. */
function cuesToJson3(
  cues: { begin: number; end: number; text: string }[],
): Json3File {
  return {
    events: cues.map((c) => ({
      tStartMs: c.begin * 1000,
      dDurationMs: (c.end - c.begin) * 1000,
      segs: [{ utf8: c.text }],
    })),
  };
}

describe("mergeCaptions (tiered)", () => {
  it("uses strict when timestamps match exactly", () => {
    const result = mergeCaptions(
      { json3: cuesToJson3([{ begin: 0, end: 2, text: "a" }]), vssId: ".ko" },
      { json3: cuesToJson3([{ begin: 0, end: 2, text: "x" }]), vssId: ".en" },
    );
    expect(result.strategy).toBe("strict");
  });

  it("falls through to partition on count mismatch", () => {
    const result = mergeCaptions(
      {
        json3: cuesToJson3([
          { begin: 0, end: 5, text: "a" },
          { begin: 5, end: 10, text: "b" },
        ]),
        vssId: ".ko",
      },
      {
        json3: cuesToJson3([{ begin: 0, end: 10, text: "x" }]),
        vssId: ".en",
      },
    );
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
    for (const j of m.cue2Indices) {
      assignedCue2s.add(j);
    }
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
  });

  describe("aK8Yh3RTBUY (auto-translated)", () => {
    const videoDir = join(YOUTUBE_JSON_DIR, "aK8Yh3RTBUY");
    const ko = loadTrack(videoDir, "track-a.ko.json");
    const en = loadTrack(videoDir, "track-a.ko.t.en.json");

    it("cue counts", () => {
      expect({ ko: ko.length, en: en.length }).toMatchInlineSnapshot(`
        {
          "en": 182,
          "ko": 215,
        }
      `);
    });
    it("partition", () => {
      expect(mergeStats(mergePartition(ko, en), en)).toMatchInlineSnapshot(`
        {
          "droppedCue2s": 0,
          "emptyText2": 0,
          "rows": 182,
          "sharedCue2s": 0,
          "withText1": 182,
          "withText2": 182,
        }
      `);
    });
    it("mergeCaptions detects translated pair → partition (count mismatch)", () => {
      const koJson3 = loadJson3(videoDir, "track-a.ko.json");
      const enJson3 = loadJson3(videoDir, "track-a.ko.t.en.json");
      const result = mergeCaptions(
        { json3: koJson3, vssId: "a.ko" },
        { json3: enJson3, vssId: "a.ko.t.en" },
      );
      expect(result.strategy).toBe("partition");
      expect(result.captions.length).toBe(182);
    });
  });

  describe("DtK-CkwNHSY", () => {
    it("cue counts", () => {
      expect({ ko: v2.ko.length, en: v2.en.length }).toMatchInlineSnapshot(`
        {
          "en": 40,
          "ko": 85,
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
            "withText1": 39,
            "withText2": 40,
          }
        `);
    });
  });
});
