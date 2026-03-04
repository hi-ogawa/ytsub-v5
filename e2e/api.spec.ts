import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb();
});

const rpc = (request: any, path: string, data: any = {}) =>
  request.post(`/api/${path.replace(/\./g, "/")}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer dev",
    },
    data: { json: data },
  });

const json = async (res: any) => {
  const body = await res.json();
  return body.json;
};

const uid = () => Math.random().toString(36).slice(2);

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
    const youtubeId = `delete-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "To Delete",
      }),
    );

    await rpc(request, "videos/createCaptions", {
      videoId: video.id,
      captions: [{ language: "ko", idx: 0, begin: 0, end: 1, text: "test" }],
    });

    const delRes = await rpc(request, "videos/deleteVideo", { id: video.id });
    expect(delRes.ok()).toBe(true);

    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    expect(getRes.ok()).toBe(false);
  });

  test("create captions for a video", async ({ request }) => {
    const youtubeId = `caption-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "Caption Video",
      }),
    );

    const captionRes = await rpc(request, "videos/createCaptions", {
      videoId: video.id,
      captions: [
        { language: "ko", idx: 0, begin: 0, end: 2.5, text: "안녕하세요" },
        { language: "ko", idx: 1, begin: 2.5, end: 5, text: "감사합니다" },
        { language: "en", idx: 0, begin: 0, end: 2.5, text: "Hello" },
      ],
    });
    expect(captionRes.ok()).toBe(true);
    const result = await json(captionRes);
    expect(result.inserted).toBe(3);

    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    const got = await json(getRes);
    expect(got.captionCounts).toHaveLength(2);
    const koCounts = got.captionCounts.find((c: any) => c.language === "ko");
    expect(koCounts.count).toBe(2);
  });
});

test.describe("bookmarks API", () => {
  test("create, list, and update bookmarks", async ({ request }) => {
    const youtubeId = `bookmark-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "Bookmark Video",
      }),
    );

    const createRes = await rpc(request, "bookmarks/createBookmarks", {
      bookmarks: [
        {
          videoId: video.id,
          text: "안녕",
          translation: "hello",
          timestamp: 1.5,
        },
        {
          videoId: video.id,
          text: "세계",
          translation: "world",
          timestamp: 3.0,
        },
      ],
    });
    expect(createRes.ok()).toBe(true);
    const created = await json(createRes);
    expect(created.inserted).toBe(2);

    const listRes = await rpc(request, "bookmarks/listBookmarks", {
      videoId: video.id,
    });
    expect(listRes.ok()).toBe(true);
    const list = await json(listRes);
    expect(list.total).toBe(2);
    expect(list.items[0].status).toBe("pending");

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

    const filteredRes = await rpc(request, "bookmarks/listBookmarks", {
      videoId: video.id,
      status: "approved",
    });
    const filtered = await json(filteredRes);
    expect(filtered.total).toBe(1);
  });

  test("delete bookmark", async ({ request }) => {
    const youtubeId = `del-bm-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", { youtubeId, title: "BM Del" }),
    );
    await rpc(request, "bookmarks/createBookmarks", {
      bookmarks: [{ videoId: video.id, text: "삭제", timestamp: 0 }],
    });
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
