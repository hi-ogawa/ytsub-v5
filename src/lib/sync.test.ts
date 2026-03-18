import { expect, test } from "vitest";
import { computeSyncState } from "./sync";

// Full combination table for computeSyncState.
// 3 inputs (localUpdatedAt, syncedAt, serverUpdatedAt).
// 0 present: 1, 1 present: 3, 2 present: 3×2!=6, 3 present: 3!=6 → total 16 cases.
test(computeSyncState, () => {
  const T1 = "2025-01-01T00:00:00Z";
  const T2 = "2025-01-02T00:00:00Z";
  const T3 = "2025-01-03T00:00:00Z";
  const __ = undefined;

  // oxfmt-ignore
  const cases = [
    // localUpdatedAt | syncedAt | serverUpdatedAt => state
    // 0 present
    [__, __, __, "unknown",  "#1  (none)"],
    // 1 present
    [T1, __, __, "push",     "#2  local only"],
    [__, T1, __, "unknown",  "#3  impossible: syncedAt without local"],
    [__, __, T1, "unknown",  "#4  server only, no local"],
    // 2 present: local + synced (no server)
    [T1, T2, __, "synced",   "#5  local < synced, server gone"],
    [T2, T1, __, "push",     "#6  local > synced, server gone"],
    // 2 present: local + server (no synced)
    [T1, __, T2, "conflict", "#7  both exist, never synced"],
    [T2, __, T1, "conflict", "#8  both exist, never synced (flipped)"],
    // 2 present: synced + server (no local) — structurally impossible
    [__, T1, T2, "unknown",  "#9  impossible: syncedAt without local"],
    [__, T2, T1, "unknown",  "#10 impossible: syncedAt without local"],
    // 3 present: 3! = 6 permutations of (T1, T2, T3)
    [T1, T2, T3, "pull",     "#11 local=old  synced=mid  server=new"],
    [T1, T3, T2, "synced",   "#12 local=old  synced=new  server=old"],
    [T2, T1, T3, "conflict", "#13 local=new  synced=old  server=new"],
    [T2, T3, T1, "synced",   "#14 local=old  synced=new  server=old"],
    [T3, T1, T2, "conflict", "#15 local=new  synced=old  server=new"],
    [T3, T2, T1, "push",     "#16 local=new  synced=mid  server=old"],
  ] as const;

  for (const [local, synced, server, expected, note] of cases) {
    expect
      .soft(
        computeSyncState({
          localUpdatedAt: local,
          syncedAt: synced,
          serverUpdatedAt: server,
        }),
        note,
      )
      .toBe(expected);
  }
});
