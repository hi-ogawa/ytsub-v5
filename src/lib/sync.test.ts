import { expect, test } from "vitest";
import { computeSyncState } from "./sync";

// Full 8-combination table: each of (localUpdatedAt, syncedAt, serverUpdatedAt) present or absent.
// [localUpdatedAt, syncedAt, serverUpdatedAt, expected, note]
test(computeSyncState, () => {
  const T1 = "2025-01-01T00:00:00Z";
  const T2 = "2025-01-02T00:00:00Z";
  const T3 = "2025-01-03T00:00:00Z";

  // oxfmt-ignore
  const cases = [
    // localUpdatedAt | syncedAt | serverUpdatedAt  => state
    // #1-4: no local entry — caller should handle; syncedAt without local is structurally impossible
    [undefined, undefined, undefined, "unknown",   "#1 no local, no server"],
    [undefined, undefined, T1,        "unknown",   "#2 no local, server exists"],
    [undefined, T1,        undefined, "unknown",   "#3 impossible: syncedAt without local"],
    [undefined, T1,        T1,        "unknown",   "#4 impossible: syncedAt without local"],
    // #5-7: has local, never or previously synced
    [T1,        undefined, undefined, "push",      "#5 local only, never synced"],
    [T1,        undefined, T2,        "conflict",  "#6 both exist, never synced (multi-device)"],
    [T2,        T1,        undefined, "push",      "#7 degenerate: synced before but server gone"],
    // #8: has local, has synced, has server — compare timestamps against checkpoint
    [T1,        T2,        T1,        "synced",    "#8a neither changed since sync"],
    [T3,        T2,        T1,        "push",      "#8b local changed since sync"],
    [T1,        T2,        T3,        "pull",      "#8c server changed since sync"],
    [T3,        T2,        T3,        "conflict",  "#8d both changed since sync"],
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
