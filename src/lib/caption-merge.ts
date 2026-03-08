// Caption merging: align two subtitle tracks into paired text1/text2 rows.
// Implements multiple strategies with increasing sophistication.

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

function computeOverlap(a: CaptionCue, b: CaptionCue): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.begin, b.begin));
}

export function mergeOverlap(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergedCaption[] {
  return cues1.map((c1, i) => {
    const overlaps = cues2
      .map((c2, j) => ({ c2, j, overlap: computeOverlap(c1, c2) }))
      .filter((o) => o.overlap > 0);

    const candidates = overlaps.filter((o) => o.overlap >= 2);
    let text2 = "";
    if (candidates.length > 0) {
      text2 = candidates.map((o) => o.c2.text).join(" ");
    } else if (overlaps.length > 0) {
      // Pick best overlap
      overlaps.sort((a, b) => b.overlap - a.overlap);
      text2 = overlaps[0].c2.text;
    }

    return { idx: i, begin: c1.begin, end: c1.end, text1: c1.text, text2 };
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
    return { idx: i, begin: c1.begin, end: c1.end, text1: c1.text, text2 };
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
    return { idx, begin: c1.begin, end: c1.end, text1: c1.text, text2 };
  });
}

// === Tiered merge: try strategies in order ===

type MergeStrategy =
  | "strict"
  | "relaxed-strict"
  | "overlap"
  | "bidirectional"
  | "dtw";

interface MergeResult {
  strategy: MergeStrategy;
  captions: MergedCaption[];
}

export function mergeCaptions(
  cues1: CaptionCue[],
  cues2: CaptionCue[],
): MergeResult {
  // Try strict first
  const strict = mergeStrict(cues1, cues2);
  if (strict) return { strategy: "strict", captions: strict };

  // Try relaxed strict
  const relaxed = mergeRelaxedStrict(cues1, cues2);
  if (relaxed) return { strategy: "relaxed-strict", captions: relaxed };

  // Use DTW as default (globally optimal)
  return { strategy: "dtw", captions: mergeDTW(cues1, cues2) };
}
