import { expect, test } from "vitest";
import { computeSyncState } from "./sync";

// Full combination table for computeSyncState.
// 3 inputs (localEditedAt, syncedEditedAt, serverEditedAt), each missing or one
// of the values A, B, C. Only which inputs are equal matters.
test(computeSyncState, () => {
  const A = "2025-01-01T00:00:00.000Z";
  const B = "2025-01-02T00:00:00.000Z";
  const C = "2025-01-03T00:00:00.000Z";
  const __ = undefined;

  // oxfmt-ignore
  const cases = [
    // local | synced | server => state
    // 0 present
    [__, __, __, "empty",    "#1  (none)"],
    // 1 present
    [A,  __, __, "push",     "#2  local only"],
    [__, A,  __, "empty",    "#3  impossible: synced without local"],
    [__, __, A,  "pull",     "#4  server only, no local → pull"],
    // 2 present: local + synced (no server)
    [A,  A,  __, "push",     "#5  unchanged, server gone → re-push"],
    [B,  A,  __, "push",     "#6  changed, server gone"],
    // 2 present: local + server (no synced)
    [A,  __, A,  "conflict", "#7  both exist, never synced"],
    [A,  __, B,  "conflict", "#8  both exist, never synced, different"],
    // 2 present: synced + server (no local) — structurally impossible
    [__, A,  A,  "pull",     "#9  impossible: synced without local → pull"],
    // 3 present
    [A,  A,  A,  "synced",   "#10 neither changed"],
    [B,  A,  A,  "push",     "#11 local changed"],
    [A,  A,  B,  "pull",     "#12 server changed"],
    [B,  A,  C,  "conflict", "#13 both changed"],
    [B,  A,  B,  "conflict", "#14 both changed to the same time"],
    [A,  B,  B,  "push",     "#15 local changed to an earlier time"],
    [B,  B,  A,  "pull",     "#16 server changed to an earlier time"],
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
