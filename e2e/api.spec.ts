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
    expect(got.captionCount).toBe(0);
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
      captions: [{ idx: 0, begin: 0, end: 1, text1: "테스트", text2: "test" }],
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
        { idx: 0, begin: 0, end: 2.5, text1: "안녕하세요", text2: "Hello" },
        { idx: 1, begin: 2.5, end: 5, text1: "감사합니다", text2: "Thank you" },
      ],
    });
    expect(captionRes.ok()).toBe(true);
    const result = await json(captionRes);
    expect(result.inserted).toBe(2);

    const getRes = await rpc(request, "videos/getVideo", { id: video.id });
    const got = await json(getRes);
    expect(got.captionCount).toBe(2);
  });
});

test.describe("importVideo API", () => {
  test("imports video, captions, and bookmarks in one call", async ({
    request,
  }) => {
    const youtubeId = `import-${uid()}`;
    const res = await rpc(request, "videos/importVideo", {
      video: {
        youtubeId,
        title: "Import Test",
        channelName: "Test Channel",
        duration: 100,
      },
      captions: [
        { idx: 0, begin: 0, end: 3, text1: "안녕하세요", text2: "Hello" },
        { idx: 1, begin: 3, end: 6, text1: "감사합니다", text2: "Thank you" },
      ],
      bookmarks: [
        {
          text: "안녕",
          translation: "hello",
          captionIdx: 0,
          side: 0,
          offset: 0,
          context: "안녕하세요",
        },
      ],
    });
    expect(res.ok()).toBe(true);
    const result = await json(res);
    expect(result.videoId).toBeGreaterThan(0);
    expect(result.captions).toBe(2);
    expect(result.bookmarks).toBe(1);

    // Verify video exists with captions
    const video = await json(
      await rpc(request, "videos/getVideo", { id: result.videoId }),
    );
    expect(video.title).toBe("Import Test");
    expect(video.captionCount).toBe(2);

    // Verify bookmark was created with resolved captionId
    const bms = await json(
      await rpc(request, "bookmarks/listBookmarks", {
        videoId: result.videoId,
      }),
    );
    expect(bms.total).toBe(1);
    expect(bms.items[0].text).toBe("안녕");
    expect(bms.items[0].captionId).toBeGreaterThan(0);
    expect(bms.items[0].timestamp).toBe(0);
  });

  test("imports large caption set (300+) without hitting SQL variable limit", async ({
    request,
  }) => {
    const youtubeId = `large-${uid()}`;
    const captionCount = 350;
    const caps = Array.from({ length: captionCount }, (_, i) => ({
      idx: i,
      begin: i * 2,
      end: i * 2 + 2,
      text1: `자막${i}`,
      text2: `caption${i}`,
    }));
    const res = await rpc(request, "videos/importVideo", {
      video: { youtubeId, title: "Large Video" },
      captions: caps,
    });
    expect(res.ok()).toBe(true);
    const result = await json(res);
    expect(result.captions).toBe(captionCount);

    const video = await json(
      await rpc(request, "videos/getVideo", { id: result.videoId }),
    );
    expect(video.captionCount).toBe(captionCount);
  });

  test("imports large bookmark set (50+) without hitting SQL variable limit", async ({
    request,
  }) => {
    const youtubeId = `large-bm-${uid()}`;
    const bookmarkCount = 50;
    const caps = Array.from({ length: bookmarkCount }, (_, i) => ({
      idx: i,
      begin: i * 2,
      end: i * 2 + 2,
      text1: `자막${i}`,
      text2: `caption${i}`,
    }));
    const bms = Array.from({ length: bookmarkCount }, (_, i) => ({
      text: `단어${i}`,
      translation: `word${i}`,
      captionIdx: i,
      side: 0,
      offset: 0,
      context: `자막${i}`,
    }));
    const res = await rpc(request, "videos/importVideo", {
      video: { youtubeId, title: "Large Bookmark Video" },
      captions: caps,
      bookmarks: bms,
    });
    expect(res.ok()).toBe(true);
    const result = await json(res);
    expect(result.captions).toBe(bookmarkCount);
    expect(result.bookmarks).toBe(bookmarkCount);

    const bmList = await json(
      await rpc(request, "bookmarks/listBookmarks", {
        videoId: result.videoId,
        limit: 100,
      }),
    );
    expect(bmList.total).toBe(bookmarkCount);
  });

  test("re-import replaces captions and bookmarks", async ({ request }) => {
    const youtubeId = `reimport-${uid()}`;
    // First import
    const res1 = await json(
      await rpc(request, "videos/importVideo", {
        video: { youtubeId, title: "V1" },
        captions: [
          { idx: 0, begin: 0, end: 1, text1: "원본", text2: "original" },
        ],
      }),
    );

    // Re-import with different data
    const res2 = await json(
      await rpc(request, "videos/importVideo", {
        video: { youtubeId, title: "V2" },
        captions: [
          { idx: 0, begin: 0, end: 2, text1: "갱신", text2: "updated" },
          { idx: 1, begin: 2, end: 4, text1: "추가", text2: "added" },
        ],
      }),
    );

    // Same video ID (upsert)
    expect(res2.videoId).toBe(res1.videoId);
    expect(res2.captions).toBe(2);

    // Captions replaced, not accumulated
    const video = await json(
      await rpc(request, "videos/getVideo", { id: res2.videoId }),
    );
    expect(video.title).toBe("V2");
    expect(video.captionCount).toBe(2);

    const caps = await json(
      await rpc(request, "videos/listCaptions", { videoId: res2.videoId }),
    );
    expect(caps[0].text1).toBe("갱신");
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
