// Caption merging: align two subtitle tracks into paired text1/text2 rows.
//
// mergeCaptions tries the strategies in order:
// - strict: same cue count and timestamps within 0.5s → zip
// - relaxed-strict: same, with 2s tolerance
// - partition: the fewer-cue track drives the rows, and each cue of the other
//   track joins the row whose midpoint is closest. 100% coverage, no drops,
//   no duplication on either side, and clean 1:1 sentence pairs in the common
//   case (manual en + auto ko)

import { type CaptionCue, type Json3File, parseJson3 } from "./youtube.ts";

export interface MergedCaption {
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
  /** Which cue1 indices were merged into this row */
  cue1Indices: number[];
  /** Which cue2 indices were assigned to this row */
  cue2Indices: number[];
  /** Individual text segments before joining (for rendering separators) */
  text1Segments: string[];
  text2Segments: string[];
}

// === Strategy 1: Strict ===
// Same count + all timestamps within tolerance → zip

export function mergeStrict(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
  tolerance = 0.5,
): MergedCaption[] | undefined {
  if (cues1.length !== cues2.length) {
    return undefined;
  }
  for (let i = 0; i < cues1.length; i++) {
    if (Math.abs(cues1[i].begin - cues2[i].begin) > tolerance) {
      return undefined;
    }
  }
  return cues1.map((c1, i) => ({
    idx: i,
    begin: c1.begin,
    end: c1.end,
    text1: c1.text,
    text2: cues2[i].text,
    cue1Indices: [i],
    cue2Indices: [i],
    text1Segments: [c1.text],
    text2Segments: [cues2[i].text],
  }));
}

// === Strategy 2: Relaxed strict (tolerance = 2s) ===

export function mergeRelaxedStrict(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] | undefined {
  return mergeStrict(cues1, cues2, 2.0);
}

// === Strategy 3: Partition ===
// Uses the longer (fewer-cue) track as row boundaries.
// Each cue from the shorter (more-cue) track is assigned to the boundary cue
// whose midpoint is closest. No duplication on either side.

export function mergePartition(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  // Determine which track has fewer cues — that one drives row boundaries
  const cue1Drives = cues1.length <= cues2.length;
  const drivers = cue1Drives ? cues1 : cues2;
  const followers = cue1Drives ? cues2 : cues1;

  // Assign each follower to the driver whose midpoint is closest
  const driverMids = drivers.map((c) => (c.begin + c.end) / 2);
  const assignments = new Map<number, number[]>();

  for (let f = 0; f < followers.length; f++) {
    const fMid = (followers[f].begin + followers[f].end) / 2;
    let bestD = 0;
    let bestDist = Math.abs(fMid - driverMids[0]);
    for (let d = 1; d < drivers.length; d++) {
      const dist = Math.abs(fMid - driverMids[d]);
      if (dist < bestDist) {
        bestDist = dist;
        bestD = d;
      }
    }
    if (!assignments.has(bestD)) {
      assignments.set(bestD, []);
    }
    assignments.get(bestD)!.push(f);
  }

  return drivers.map((drv, d) => {
    const assigned = assignments.get(d) ?? [];
    const followerSegments = assigned.map((f) => followers[f].text);
    const followerText = followerSegments.join(" ");
    return {
      idx: d,
      begin: drv.begin,
      end: drv.end,
      text1: cue1Drives ? drv.text : followerText,
      text2: cue1Drives ? followerText : drv.text,
      cue1Indices: cue1Drives ? [d] : assigned,
      cue2Indices: cue1Drives ? assigned : [d],
      text1Segments: cue1Drives ? [drv.text] : followerSegments,
      text2Segments: cue1Drives ? followerSegments : [drv.text],
    };
  });
}

// === Tiered merge: try strategies in order ===

interface TrackInput {
  json3: Json3File;
  vssId: string;
}

/** Detect if two vssIds form a translated pair (one is prefix of the other + ".t."). */
function isTranslatedPair(vssId1: string, vssId2: string): boolean {
  return vssId2.startsWith(`${vssId1}.t.`) || vssId1.startsWith(`${vssId2}.t.`);
}

/**
 * Merge two caption tracks. Parses JSON3 internally and selects strategy
 * based on vssId relationship:
 * - Translated pair → strict (shared tStartMs)
 * - Same count + close timestamps → strict / relaxed-strict
 * - Otherwise → partition
 */
export function mergeCaptions(
  track1: TrackInput,
  track2: TrackInput,
): MergedCaption[] {
  const cues1 = parseJson3(track1.json3);
  const cues2 = parseJson3(track2.json3);

  // Translated pair: events share tStartMs, strict should work
  if (isTranslatedPair(track1.vssId, track2.vssId)) {
    const strict = mergeStrict(cues1, cues2, 0.5);
    if (strict) {
      return strict;
    }
    // Fallback to partition if strict fails (count mismatch from dropped events)
    return mergePartition(cues1, cues2);
  }

  // Try strict first
  const strict = mergeStrict(cues1, cues2);
  if (strict) {
    return strict;
  }

  // Try relaxed strict
  const relaxed = mergeRelaxedStrict(cues1, cues2);
  if (relaxed) {
    return relaxed;
  }

  // Use partition as default (100% coverage, no drops, no duplication)
  return mergePartition(cues1, cues2);
}
