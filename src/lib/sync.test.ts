import { expect, test } from "vitest";
import { computeSyncState } from "./sync";

// Full combination table for computeSyncState.
// 3 inputs (localEditedAt, syncedEditedAt, serverEditedAt), each missing or one
// of the values T1, T2, T3. Only which inputs are equal matters.
test(computeSyncState, () => {
  const T1 = "2025-01-01T00:00:00Z";
  const T2 = "2025-01-02T00:00:00Z";
  const T3 = "2025-01-03T00:00:00Z";
  const __ = undefined;

  // oxfmt-ignore
  const cases = [
    // local | synced | server => state
    // 0 present
    [__, __, __, "empty",    "#1  (none)"],
    // 1 present
    [T1, __, __, "push",     "#2  local only"],
    [__, T1, __, "empty",    "#3  impossible: synced without local"],
    [__, __, T1, "pull",     "#4  server only, no local → pull"],
    // 2 present: local + synced (no server)
    [T1, T1, __, "push",     "#5  unchanged, server gone → re-push"],
    [T2, T1, __, "push",     "#6  changed, server gone"],
    // 2 present: local + server (no synced)
    [T1, __, T1, "conflict", "#7  both exist, never synced"],
    [T1, __, T2, "conflict", "#8  both exist, never synced, different"],
    // 2 present: synced + server (no local) — structurally impossible
    [__, T1, T1, "pull",     "#9  impossible: synced without local → pull"],
    // 3 present
    [T1, T1, T1, "synced",   "#10 neither changed"],
    [T2, T1, T1, "push",     "#11 local changed"],
    [T1, T1, T2, "pull",     "#12 server changed"],
    [T2, T1, T3, "conflict", "#13 both changed"],
    [T2, T1, T2, "conflict", "#14 both changed to the same time"],
    [T1, T2, T2, "push",     "#15 local changed to an earlier time"],
    [T2, T2, T1, "pull",     "#16 server changed to an earlier time"],
  ] as const;

  for (const [local, synced, server, expected, note] of cases) {
    expect
      .soft(
        computeSyncState({
          localEditedAt: local,
          syncedEditedAt: synced,
          serverEditedAt: server,
        }),
        note,
      )
      .toBe(expected);
  }
});
