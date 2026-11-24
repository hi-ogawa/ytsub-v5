import { expect, test } from "vitest";
import type { VideoIndexEntry } from "../lib/caption-storage.ts";
import { mergeVideoEntries } from "./use-video-list-sync.ts";

const T1 = "2025-01-01T00:00:00.000Z";
const T2 = "2025-01-02T00:00:00.000Z";

function createLocal(youtubeId: string, editedAt: string): VideoIndexEntry {
  return {
    youtubeId,
    title: youtubeId,
    channelName: "channel",
    bookmarkCount: 1,
    editedAt,
    syncedEditedAt: T1,
  };
}

function createServer(youtubeId: string, editedAt: string) {
  return {
    id: 1,
    youtubeId,
    title: youtubeId,
    channelName: "channel",
    editedAt,
  };
}

test("edit time is the later of the local and server edit times", () => {
  const entries = mergeVideoEntries(
    [
      createLocal("synced", T1),
      createLocal("pull", T1),
      createLocal("push", T2),
      createLocal("local-only", T2),
    ],
    [
      createServer("synced", T1),
      createServer("pull", T2),
      createServer("push", T1),
      createServer("server-only", T2),
    ] as Parameters<typeof mergeVideoEntries>[1],
  );
  expect(
    entries.map(({ youtubeId, syncStatus, editedAt, localEditedAt }) => ({
      youtubeId,
      syncStatus,
      editedAt,
      localEditedAt,
    })),
  ).toEqual([
    {
      youtubeId: "synced",
      syncStatus: "synced",
      editedAt: T1,
      localEditedAt: T1,
    },
    { youtubeId: "pull", syncStatus: "pull", editedAt: T2, localEditedAt: T1 },
    { youtubeId: "push", syncStatus: "push", editedAt: T2, localEditedAt: T2 },
    {
      youtubeId: "local-only",
      syncStatus: "push",
      editedAt: T2,
      localEditedAt: T2,
    },
    {
      youtubeId: "server-only",
      syncStatus: "pull",
      editedAt: T2,
      localEditedAt: undefined,
    },
  ]);
});
