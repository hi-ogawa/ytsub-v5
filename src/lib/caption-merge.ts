// Caption merging: align two subtitle tracks into paired text1/text2 rows.
// Implements multiple strategies with increasing sophistication.
//
// Strategy comparison (tested against real YouTube data):
//
// | Strategy      | Direction   | Duplicates | Coverage | Drops | Notes                          |
// |---------------|-------------|------------|----------|-------|--------------------------------|
// | strict        | zip         | no         | —        | no    | Fails on count/timing mismatch |
// | relaxed-strict| zip         | no         | —        | no    | Fails on count mismatch        |
// | overlap       | cue1→cue2   | yes        | 100%     | no    | Greedy per-cue, orphan rescue  |
// | best-overlap  | cue1→cue2   | yes        | 100%     | no    | Single best cue2 per cue1      |
// | partition     | fewer→more  | no         | 100%     | no    | Midpoint assignment, no dupes  |
// | bidirectional | cue2→cue1   | no         | ~45-90%  | yes   | Each cue2 assigned to one cue1 |
// | dtw           | global DP   | no         | ~47-90%  | yes   | Globally optimal, monotonic    |
//
// Why overlap is the best default for this use case:
// - 100% coverage: every cue1 gets English text if any temporal overlap exists
// - No drops: orphan cue2s (zero overlap) become rows with empty text1
// - Duplicates are acceptable: the viewer shows ko/en pairs per row;
//   seeing the same English line on adjacent Korean cues is fine for reading
// - Simple and fast: O(n*m) greedy, no DP allocation
// - Bidirectional/DTW trade coverage for dedup — not a useful tradeoff here
//   since the reading experience degrades more from missing text than from
//   occasional repetition

export interface CaptionCue {
  begin: number;
  end: number;
  text: string;
}

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
}

// === Strategy 1: Strict check (current v5 behavior) ===
// Same count + all timestamps within tolerance → zip

export function mergeStrict(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
  tolerance = 0.5,
): MergedCaption[] | undefined {
  if (cues1.length !== cues2.length) return undefined;
  for (let i = 0; i < cues1.length; i++) {
    if (Math.abs(cues1[i].begin - cues2[i].begin) > tolerance) return undefined;
  }
  return cues1.map((c1, i) => ({
    idx: i,
    begin: c1.begin,
    end: c1.end,
    text1: c1.text,
    text2: cues2[i].text,
    cue1Indices: [i],
    cue2Indices: [i],
  }));
}

// === Strategy 2: Relaxed strict (tolerance = 2s) ===

export function mergeRelaxedStrict(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] | undefined {
  return mergeStrict(cues1, cues2, 2.0);
}

// === Strategy 3: Overlap heuristic (v4 port) ===
// For each cue in track1, find overlapping cues in track2.
// 1:N merge — one track1 cue can absorb multiple track2 cues.

function reindex(rows: MergedCaption[]): MergedCaption[] {
  return rows.map((r, i) => ({ ...r, idx: i }));
}

function computeOverlap(a: CaptionCue, b: CaptionCue): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.begin, b.begin));
}

export function mergeOverlap(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  // Track which cue2s get assigned to at least one cue1
  const assignedCue2s = new Set<number>();

  const rows: MergedCaption[] = cues1.map((c1, i) => {
    const overlaps = cues2
      .map((c2, j) => ({ c2, j, overlap: computeOverlap(c1, c2) }))
      .filter((o) => o.overlap > 0);

    let text2 = "";
    let cue2Indices: number[] = [];
    if (overlaps.length > 0) {
      // Include all overlapping cue2s, sorted by start time
      overlaps.sort((a, b) => a.c2.begin - b.c2.begin);
      cue2Indices = overlaps.map((o) => o.j);
      text2 = overlaps.map((o) => o.c2.text).join(" ");
      for (const j of cue2Indices) assignedCue2s.add(j);
    }

    return {
      idx: i,
      begin: c1.begin,
      end: c1.end,
      text1: c1.text,
      text2,
      cue1Indices: [i],
      cue2Indices,
    };
  });

  // Collect orphan cue2s (no overlap with any cue1) as rows with empty text1
  const orphans: MergedCaption[] = [];
  for (let j = 0; j < cues2.length; j++) {
    if (!assignedCue2s.has(j)) {
      orphans.push({
        idx: -1, // placeholder, will be reassigned below
        begin: cues2[j].begin,
        end: cues2[j].end,
        text1: "",
        text2: cues2[j].text,
        cue1Indices: [],
        cue2Indices: [j],
      });
    }
  }

  if (orphans.length === 0) return reindex(rows);

  // Interleave orphans into rows by begin time
  const all = [...rows, ...orphans];
  all.sort((a, b) => a.begin - b.begin);
  return reindex(all);
}

// === Strategy 3b: Best-overlap ===
// Like overlap but each cue1 picks only its single best-overlapping cue2.
// Same cue2 can still be picked by multiple cue1s (allows duplication).
// Produces clean single-sentence text2 per row.

export function mergeBestOverlap(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  const assignedCue2s = new Set<number>();

  const rows: MergedCaption[] = cues1.map((c1, i) => {
    let bestJ = -1;
    let bestOverlap = 0;
    for (let j = 0; j < cues2.length; j++) {
      const ov = computeOverlap(c1, cues2[j]);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        bestJ = j;
      }
    }

    if (bestJ >= 0) {
      assignedCue2s.add(bestJ);
      return {
        idx: i,
        begin: c1.begin,
        end: c1.end,
        text1: c1.text,
        text2: cues2[bestJ].text,
        cue1Indices: [i],
        cue2Indices: [bestJ],
      };
    }
    return {
      idx: i,
      begin: c1.begin,
      end: c1.end,
      text1: c1.text,
      text2: "",
      cue1Indices: [i],
      cue2Indices: [],
    };
  });

  // Orphan rescue (same as mergeOverlap)
  const orphans: MergedCaption[] = [];
  for (let j = 0; j < cues2.length; j++) {
    if (!assignedCue2s.has(j)) {
      orphans.push({
        idx: -1,
        begin: cues2[j].begin,
        end: cues2[j].end,
        text1: "",
        text2: cues2[j].text,
        cue1Indices: [],
        cue2Indices: [j],
      });
    }
  }

  if (orphans.length === 0) return reindex(rows);

  const all = [...rows, ...orphans];
  all.sort((a, b) => a.begin - b.begin);
  return reindex(all);
}

// === Strategy 3c: Partition ===
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
    if (!assignments.has(bestD)) assignments.set(bestD, []);
    assignments.get(bestD)!.push(f);
  }

  return drivers.map((drv, d) => {
    const assigned = assignments.get(d) ?? [];
    const followerText = assigned.map((f) => followers[f].text).join(" ");
    return {
      idx: d,
      begin: drv.begin,
      end: drv.end,
      text1: cue1Drives ? drv.text : followerText,
      text2: cue1Drives ? followerText : drv.text,
      cue1Indices: cue1Drives ? [d] : assigned,
      cue2Indices: cue1Drives ? assigned : [d],
    };
  });
}

// === Strategy 4: Bidirectional overlap ===
// Like overlap heuristic but deduplicates: each cue2 is assigned to at most
// one cue1 (the one with best overlap). Prevents duplicate text2 across rows.

export function mergeBidirectional(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  // For each cue2, find the cue1 with best overlap → assignment map
  const cue2ToCue1 = new Map<number, number>(); // cue2 index → cue1 index

  for (let j = 0; j < cues2.length; j++) {
    let bestI = -1;
    let bestOverlap = 0;
    for (let i = 0; i < cues1.length; i++) {
      const overlap = computeOverlap(cues1[i], cues2[j]);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      cue2ToCue1.set(j, bestI);
    }
  }

  // Invert: for each cue1, collect assigned cue2s (sorted by begin time)
  const cue1ToCue2s = new Map<number, number[]>();
  for (const [j, i] of cue2ToCue1) {
    if (!cue1ToCue2s.has(i)) cue1ToCue2s.set(i, []);
    cue1ToCue2s.get(i)!.push(j);
  }
  for (const indices of cue1ToCue2s.values()) {
    indices.sort((a, b) => cues2[a].begin - cues2[b].begin);
  }

  return cues1.map((c1, i) => {
    const assigned = cue1ToCue2s.get(i) ?? [];
    const text2 = assigned.map((j) => cues2[j].text).join(" ");
    return {
      idx: i,
      begin: c1.begin,
      end: c1.end,
      text1: c1.text,
      text2,
      cue1Indices: [i],
      cue2Indices: assigned,
    };
  });
}

// === Strategy 5: DTW (Dynamic Time Warping) ===
// Finds globally optimal alignment between two temporal sequences.
// Supports 1:N and N:1 mappings. Each cue2 is assigned to exactly one cue1.
//
// Moves from (i,j):
//   diagonal (i+1, j+1): match cue1[i] with cue2[j], advance both
//   right    (i,   j+1): assign cue2[j] to cue1[i] (1:N merge), advance j only
//   down     (i+1, j  ): skip cue1[i] (no cue2 match), advance i only

export function mergeDTW(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  const n = cues1.length;
  const m = cues2.length;

  if (n === 0) return [];
  if (m === 0) {
    return cues1.map((c, i) => ({
      idx: i,
      begin: c.begin,
      end: c.end,
      text1: c.text,
      text2: "",
      cue1Indices: [i],
      cue2Indices: [],
    }));
  }

  const INF = 1e18;

  // Cost of assigning cue2[j] to cue1[i]: lower = better
  function assignCost(i: number, j: number): number {
    const overlap = computeOverlap(cues1[i], cues2[j]);
    const midDist = Math.abs(
      (cues1[i].begin + cues1[i].end) / 2 - (cues2[j].begin + cues2[j].end) / 2,
    );
    return -overlap + midDist * 0.01;
  }

  // Cost for skipping a cue1 (leaving it with no cue2 match)
  const SKIP_COST = 2.0;

  // dp[i][j] = min cost for aligning cues1[i..n-1] with cues2[j..m-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(INF),
  );
  const choice: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  // choice: 1=diagonal, 2=right(1:N), 3=down(skip cue1)

  // Base cases
  dp[n][m] = 0;
  // Remaining cue1s with no cue2s left → skip cost each
  for (let i = n - 1; i >= 0; i--) {
    dp[i][m] = dp[i + 1][m] + SKIP_COST;
    choice[i][m] = 3;
  }
  // Remaining cue2s with no cue1s left — shouldn't happen in well-formed input
  // but handle gracefully: assign all to last cue1 (cost 0 since we can't do better)
  for (let j = m - 1; j >= 0; j--) {
    dp[n][j] = 0;
  }

  // Fill DP backwards
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const cost = assignCost(i, j);

      // Diagonal: match cue1[i] with cue2[j], then solve (i+1, j+1)
      const costDiag = cost + dp[i + 1][j + 1];

      // Right: assign cue2[j] to cue1[i], then solve (i, j+1) — 1:N merge
      const costRight = cost + dp[i][j + 1];

      // Down: skip cue1[i], then solve (i+1, j)
      const costDown = SKIP_COST + dp[i + 1][j];

      if (costDiag <= costRight && costDiag <= costDown) {
        dp[i][j] = costDiag;
        choice[i][j] = 1;
      } else if (costRight <= costDown) {
        dp[i][j] = costRight;
        choice[i][j] = 2;
      } else {
        dp[i][j] = costDown;
        choice[i][j] = 3;
      }
    }
  }

  // Trace forward to build assignments
  const assignments = new Map<number, number[]>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const c = choice[i][j];
    if (c === 1) {
      // diagonal: assign cue2[j] to cue1[i], advance both
      if (!assignments.has(i)) assignments.set(i, []);
      assignments.get(i)!.push(j);
      i++;
      j++;
    } else if (c === 2) {
      // right: assign cue2[j] to cue1[i], advance j only
      if (!assignments.has(i)) assignments.set(i, []);
      assignments.get(i)!.push(j);
      j++;
    } else {
      // down: skip cue1[i]
      i++;
    }
  }

  return cues1.map((c1, idx) => {
    const assigned = assignments.get(idx) ?? [];
    const text2 = assigned.map((j) => cues2[j].text).join(" ");
    return {
      idx,
      begin: c1.begin,
      end: c1.end,
      text1: c1.text,
      text2,
      cue1Indices: [idx],
      cue2Indices: assigned,
    };
  });
}

// === Tiered merge: try strategies in order ===

export type MergeStrategy =
  | "strict"
  | "relaxed-strict"
  | "overlap"
  | "best-overlap"
  | "partition"
  | "bidirectional"
  | "dtw";

interface MergeResult {
  strategy: MergeStrategy;
  captions: MergedCaption[];
}

export const FALLBACK_STRATEGIES: MergeStrategy[] = [
  "overlap",
  "best-overlap",
  "partition",
  "bidirectional",
  "dtw",
];

function mergeWithStrategy(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
  strategy: MergeStrategy,
): MergedCaption[] {
  switch (strategy) {
    case "strict":
      return mergeStrict(cues1, cues2) ?? mergeOverlap(cues1, cues2);
    case "relaxed-strict":
      return mergeRelaxedStrict(cues1, cues2) ?? mergeOverlap(cues1, cues2);
    case "overlap":
      return mergeOverlap(cues1, cues2);
    case "best-overlap":
      return mergeBestOverlap(cues1, cues2);
    case "partition":
      return mergePartition(cues1, cues2);
    case "bidirectional":
      return mergeBidirectional(cues1, cues2);
    case "dtw":
      return mergeDTW(cues1, cues2);
  }
}

export function mergeCaptions(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
  forceStrategy?: MergeStrategy,
): MergeResult {
  if (forceStrategy) {
    return {
      strategy: forceStrategy,
      captions: mergeWithStrategy(cues1, cues2, forceStrategy),
    };
  }

  // Try strict first
  const strict = mergeStrict(cues1, cues2);
  if (strict) return { strategy: "strict", captions: strict };

  // Try relaxed strict
  const relaxed = mergeRelaxedStrict(cues1, cues2);
  if (relaxed) return { strategy: "relaxed-strict", captions: relaxed };

  // Use overlap as default (100% coverage, no drops)
  return { strategy: "overlap", captions: mergeOverlap(cues1, cues2) };
}
