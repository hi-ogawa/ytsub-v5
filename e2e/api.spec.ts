import { expect, test } from "@playwright/test";
import {
  json,
  rpc,
  seedBookmarks,
  seedCaptions,
  seedVideo,
  uid,
} from "./fixtures.ts";

test.describe("videos API", () => {
  test("create, list, and get video", async ({ request }) => {
    const youtubeId = `test-${uid()}`;
    const createRes = await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Test Video",
      channelName: "Test Channel",
      duration: 300,
    });
    expect(createRes.ok()).toBe(true);
    const video = await json(createRes);
    expect(video.youtubeId).toBe(youtubeId);
    expect(video.title).toBe("Test Video");
    expect(video.id).toBeGreaterThan(0);

    // List videos
    const listRes = await rpc(request, "videos/listVideos", {});
    expect(listRes.ok()).toBe(true);
    const list = await json(listRes);
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.items.some((v: any) => v.youtubeId === youtubeId)).toBe(true);

    // Get video (no captions yet)
    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    expect(getRes.ok()).toBe(true);
    const got = await json(getRes);
    expect(got.title).toBe("Test Video");
    expect(got.captionCounts).toEqual([]);
  });

  test("upsert video on youtube_id conflict", async ({ request }) => {
    const youtubeId = `upsert-${uid()}`;
    await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Original",
      channelName: "Ch",
    });
    const res = await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Updated",
      channelName: "Ch",
    });
    expect(res.ok()).toBe(true);
    const video = await json(res);
    expect(video.title).toBe("Updated");
  });

  test("delete video cascades captions", async ({ request }) => {
    const video = await seedVideo(request, { title: "To Delete" });

    await seedCaptions(request, video.id, "ko", ["test"]);

    // Delete
    const delRes = await rpc(request, "videos/deleteVideo", { id: video.id });
    expect(delRes.ok()).toBe(true);

    // Verify gone
    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    expect(getRes.ok()).toBe(false);
  });

  test("create captions for a video", async ({ request }) => {
    const video = await seedVideo(request, { title: "Caption Video" });

    await seedCaptions(request, video.id, "ko", ["안녕하세요", "감사합니다"]);
    await seedCaptions(request, video.id, "en", ["Hello"]);

    // Verify caption counts in getVideo
    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    const got = await json(getRes);
    expect(got.captionCounts).toHaveLength(2);
    const koCounts = got.captionCounts.find((c: any) => c.language === "ko");
    expect(koCounts.count).toBe(2);
  });
});

test.describe("bookmarks API", () => {
  test("create, list, and update bookmarks", async ({ request }) => {
    const video = await seedVideo(request, { title: "Bookmark Video" });

    await seedBookmarks(request, video.id, ["안녕", "세계"]);

    // List all bookmarks for video
    const listRes = await rpc(request, "bookmarks/listBookmarks", {
      videoId: video.id,
    });
    expect(listRes.ok()).toBe(true);
    const list = await json(listRes);
    expect(list.total).toBe(2);
    expect(list.items[0].status).toBe("pending");

    // Update a bookmark
    const bookmarkId = list.items[0].id;
    const updateRes = await rpc(request, "bookmarks/updateBookmark", {
      id: bookmarkId,
      status: "approved",
      notes: "Common greeting",
    });
    expect(updateRes.ok()).toBe(true);
    const updated = await json(updateRes);
    expect(updated.status).toBe("approved");
    expect(updated.notes).toBe("Common greeting");

    // List filtered by status
    const filteredRes = await rpc(request, "bookmarks/listBookmarks", {
      videoId: video.id,
      status: "approved",
    });
    const filtered = await json(filteredRes);
    expect(filtered.total).toBe(1);
  });

  test("delete bookmark", async ({ request }) => {
    const video = await seedVideo(request, { title: "BM Del" });
    await seedBookmarks(request, video.id, ["삭제"]);

    const list = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId: video.id }),
    );
    const delRes = await rpc(request, "bookmarks/deleteBookmark", {
      id: list.items[0].id,
    });
    expect(delRes.ok()).toBe(true);

    const after = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId: video.id }),
    );
    expect(after.total).toBe(0);
  });
});
