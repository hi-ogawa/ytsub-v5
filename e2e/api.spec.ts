import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb();
});

/** Register a test user and return a cookie header for subsequent requests */
async function getAuthCookie(request: any): Promise<string> {
  const response = await request.post("/api/auth/register", {
    headers: { "Content-Type": "application/json" },
    data: {
      json: {
        username: `api-${Math.random().toString(36).slice(2)}`,
        password: "testpassword",
      },
    },
  });
  const setCookie = response.headers()["set-cookie"] ?? "";
  // Extract session cookie value
  const match = setCookie.match(/session=([^;]+)/);
  return match ? `session=${match[1]}` : "";
}

let cookie: string;

test.beforeAll(async ({ request }) => {
  cookie = await getAuthCookie(request);
});

const rpc = (request: any, path: string, data: any = {}) =>
  request.post(`/api/${path.replace(/\./g, "/")}`, {
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    data: { json: data },
  });

const json = async (response: any) => {
  const body = await response.json();
  return body.json;
};

const uid = () => Math.random().toString(36).slice(2);

const defaultTrackFields = {
  language1: "ko",
  language2: "en",
  vssId1: ".ko",
  vssId2: ".en",
};

test.describe("videos API", () => {
  test("create, list, and get video", async ({ request }) => {
    const youtubeId = `test-${uid()}`;
    const createResponse = await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Test Video",
      channelName: "Test Channel",
      duration: 300,
      ...defaultTrackFields,
    });
    expect(createResponse.ok()).toBe(true);
    const video = await json(createResponse);
    expect(video.youtubeId).toBe(youtubeId);
    expect(video.title).toBe("Test Video");
    expect(video.id).toBeGreaterThan(0);

    // List videos
    const listResponse = await rpc(request, "videos/listVideos", {});
    expect(listResponse.ok()).toBe(true);
    const list = await json(listResponse);
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.items.some((v: any) => v.youtubeId === youtubeId)).toBe(true);

    // Get video (no captions yet)
    const getResponse = await rpc(request, "videos/getVideo", { id: video.id });
    expect(getResponse.ok()).toBe(true);
    const got = await json(getResponse);
    expect(got.title).toBe("Test Video");
    expect(got.captionCount).toBe(0);
  });

  test("upsert video on youtube_id conflict", async ({ request }) => {
    const youtubeId = `upsert-${uid()}`;
    await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Original",
      channelName: "Ch",
      ...defaultTrackFields,
    });
    const response = await rpc(request, "videos/createVideo", {
      youtubeId,
      title: "Updated",
      channelName: "Ch",
      ...defaultTrackFields,
    });
    expect(response.ok()).toBe(true);
    const video = await json(response);
    expect(video.title).toBe("Updated");
  });

  test("delete video cascades captions", async ({ request }) => {
    const youtubeId = `delete-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "To Delete",
        ...defaultTrackFields,
      }),
    );

    await rpc(request, "videos/createCaptions", {
      videoId: video.id,
      captions: [{ idx: 0, begin: 0, end: 1, text1: "테스트", text2: "test" }],
    });

    const deleteResponse = await rpc(request, "videos/deleteVideo", {
      id: video.id,
    });
    expect(deleteResponse.ok()).toBe(true);

    const getResponse = await rpc(request, "videos/getVideo", { id: video.id });
    expect(getResponse.ok()).toBe(false);
  });

  test("create captions for a video", async ({ request }) => {
    const youtubeId = `caption-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "Caption Video",
        ...defaultTrackFields,
      }),
    );

    const captionResponse = await rpc(request, "videos/createCaptions", {
      videoId: video.id,
      captions: [
        { idx: 0, begin: 0, end: 2.5, text1: "안녕하세요", text2: "Hello" },
        { idx: 1, begin: 2.5, end: 5, text1: "감사합니다", text2: "Thank you" },
      ],
    });
    expect(captionResponse.ok()).toBe(true);
    const result = await json(captionResponse);
    expect(result.inserted).toBe(2);

    const getResponse = await rpc(request, "videos/getVideo", { id: video.id });
    const got = await json(getResponse);
    expect(got.captionCount).toBe(2);
  });

  test("update one caption row", async ({ request }) => {
    const { videoId } = await json(
      await rpc(request, "videos/importVideo", {
        video: {
          youtubeId: `update-cap-${uid()}`,
          title: "V",
          ...defaultTrackFields,
        },
        captions: [
          { idx: 0, begin: 0, end: 1, text1: "안녕하세요", text2: "Hello" },
          { idx: 1, begin: 1, end: 2, text1: "감사함니다", text2: "Thank you" },
        ],
      }),
    );

    const response = await rpc(request, "videos/updateCaption", {
      videoId,
      idx: 1,
      text1: "감사합니다",
    });
    expect(response.ok()).toBe(true);

    const captions = await json(
      await rpc(request, "videos/listCaptions", { videoId }),
    );
    expect(captions.map((c: any) => [c.text1, c.text2])).toEqual([
      ["안녕하세요", "Hello"],
      ["감사합니다", "Thank you"],
    ]);

    const missing = await rpc(request, "videos/updateCaption", {
      videoId,
      idx: 2,
      text1: "없음",
    });
    expect(missing.ok()).toBe(false);
  });
});

test.describe("importVideo API", () => {
  test("imports video, captions, and bookmarks in one call", async ({
    request,
  }) => {
    const youtubeId = `import-${uid()}`;
    const response = await rpc(request, "videos/importVideo", {
      video: {
        youtubeId,
        title: "Import Test",
        channelName: "Test Channel",
        duration: 100,
        ...defaultTrackFields,
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
    expect(response.ok()).toBe(true);
    const result = await json(response);
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
    const bookmarks = await json(
      await rpc(request, "bookmarks/listBookmarks", {
        videoId: result.videoId,
      }),
    );
    expect(bookmarks.total).toBe(1);
    expect(bookmarks.items[0].text).toBe("안녕");
    expect(bookmarks.items[0].captionId).toBeGreaterThan(0);
    expect(bookmarks.items[0].timestamp).toBe(0);
  });

  test("imports large caption set (300+) without hitting SQL variable limit", async ({
    request,
  }) => {
    const youtubeId = `large-${uid()}`;
    const captionCount = 350;
    const captions = Array.from({ length: captionCount }, (_, i) => ({
      idx: i,
      begin: i * 2,
      end: i * 2 + 2,
      text1: `자막${i}`,
      text2: `caption${i}`,
    }));
    const response = await rpc(request, "videos/importVideo", {
      video: { youtubeId, title: "Large Video", ...defaultTrackFields },
      captions,
    });
    expect(response.ok()).toBe(true);
    const result = await json(response);
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
    const captions = Array.from({ length: bookmarkCount }, (_, i) => ({
      idx: i,
      begin: i * 2,
      end: i * 2 + 2,
      text1: `자막${i}`,
      text2: `caption${i}`,
    }));
    const bookmarks = Array.from({ length: bookmarkCount }, (_, i) => ({
      text: `단어${i}`,
      translation: `word${i}`,
      captionIdx: i,
      side: 0,
      offset: 0,
      context: `자막${i}`,
    }));
    const response = await rpc(request, "videos/importVideo", {
      video: {
        youtubeId,
        title: "Large Bookmark Video",
        ...defaultTrackFields,
      },
      captions,
      bookmarks,
    });
    expect(response.ok()).toBe(true);
    const result = await json(response);
    expect(result.captions).toBe(bookmarkCount);
    expect(result.bookmarks).toBe(bookmarkCount);

    const bookmarkList = await json(
      await rpc(request, "bookmarks/listBookmarks", {
        videoId: result.videoId,
        limit: 100,
      }),
    );
    expect(bookmarkList.total).toBe(bookmarkCount);
  });

  test("re-import replaces captions and bookmarks", async ({ request }) => {
    const youtubeId = `reimport-${uid()}`;
    // First import
    const firstImport = await json(
      await rpc(request, "videos/importVideo", {
        video: { youtubeId, title: "V1", ...defaultTrackFields },
        captions: [
          { idx: 0, begin: 0, end: 1, text1: "원본", text2: "original" },
        ],
      }),
    );

    // Re-import with different data
    const secondImport = await json(
      await rpc(request, "videos/importVideo", {
        video: { youtubeId, title: "V2", ...defaultTrackFields },
        captions: [
          { idx: 0, begin: 0, end: 2, text1: "갱신", text2: "updated" },
          { idx: 1, begin: 2, end: 4, text1: "추가", text2: "added" },
        ],
      }),
    );

    // Same video ID (upsert)
    expect(secondImport.videoId).toBe(firstImport.videoId);
    expect(secondImport.captions).toBe(2);

    // Captions replaced, not accumulated
    const video = await json(
      await rpc(request, "videos/getVideo", { id: secondImport.videoId }),
    );
    expect(video.title).toBe("V2");
    expect(video.captionCount).toBe(2);

    const captions = await json(
      await rpc(request, "videos/listCaptions", {
        videoId: secondImport.videoId,
      }),
    );
    expect(captions[0].text1).toBe("갱신");
  });
});

test.describe("bookmarks API", () => {
  test("create, list, and update bookmarks", async ({ request }) => {
    const youtubeId = `bookmark-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "Bookmark Video",
        ...defaultTrackFields,
      }),
    );

    const createResponse = await rpc(request, "bookmarks/createBookmarks", {
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
    expect(createResponse.ok()).toBe(true);
    const created = await json(createResponse);
    expect(created.inserted).toBe(2);

    const listResponse = await rpc(request, "bookmarks/listBookmarks", {
      videoId: video.id,
    });
    expect(listResponse.ok()).toBe(true);
    const list = await json(listResponse);
    expect(list.total).toBe(2);
    const bookmarkId = list.items[0].id;
    const updateResponse = await rpc(request, "bookmarks/updateBookmark", {
      id: bookmarkId,
      notes: "Common greeting",
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await json(updateResponse);
    expect(updated.notes).toBe("Common greeting");
  });

  test("delete bookmark", async ({ request }) => {
    const youtubeId = `del-bm-${uid()}`;
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId,
        title: "BM Del",
        ...defaultTrackFields,
      }),
    );
    await rpc(request, "bookmarks/createBookmarks", {
      bookmarks: [{ videoId: video.id, text: "삭제", timestamp: 0 }],
    });
    const list = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId: video.id }),
    );
    const deleteResponse = await rpc(request, "bookmarks/deleteBookmark", {
      id: list.items[0].id,
    });
    expect(deleteResponse.ok()).toBe(true);

    const after = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId: video.id }),
    );
    expect(after.total).toBe(0);
  });

  test("update bookmark text and offset within its caption", async ({
    request,
  }) => {
    const { videoId } = await json(
      await rpc(request, "videos/importVideo", {
        video: {
          youtubeId: `bm-text-${uid()}`,
          title: "V",
          ...defaultTrackFields,
        },
        captions: [
          {
            idx: 0,
            begin: 0,
            end: 1,
            text1: "오늘 쌍거풀",
            text2: "today eyelid",
          },
        ],
        bookmarks: [
          { text: "쌍거풀", captionIdx: 0, offset: 3, context: "오늘 쌍거풀" },
          { text: "eyelid", captionIdx: 0, side: 1, offset: 6 },
        ],
      }),
    );
    await rpc(request, "videos/updateCaption", {
      videoId,
      idx: 0,
      text1: "오늘 쌍꺼풀이",
      text2: "double eyelid today",
    });
    const { items } = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId }),
    );
    const side0 = items.find((b: any) => b.side === 0);
    const side1 = items.find((b: any) => b.side === 1);

    const response = await rpc(request, "bookmarks/updateBookmark", {
      id: side0.id,
      text: "쌍꺼풀",
      context: "오늘 쌍꺼풀이",
    });
    expect(response.ok()).toBe(true);
    const updated = await json(response);
    expect(updated.text).toBe("쌍꺼풀");
    expect(updated.offset).toBe(3);
    expect(updated.context).toBe("오늘 쌍꺼풀이");

    // Side 1 is checked against text2
    const side1Response = await rpc(request, "bookmarks/updateBookmark", {
      id: side1.id,
      offset: 7,
    });
    expect(side1Response.ok()).toBe(true);

    const misplaced = await rpc(request, "bookmarks/updateBookmark", {
      id: side0.id,
      offset: 0,
    });
    expect(misplaced.ok()).toBe(false);
    const after = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId }),
    );
    expect(after.items.find((b: any) => b.id === side0.id).offset).toBe(3);
  });

  test("reject text changes on a bookmark without a caption", async ({
    request,
  }) => {
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId: `bm-nocap-${uid()}`,
        title: "V",
        ...defaultTrackFields,
      }),
    );
    await rpc(request, "bookmarks/createBookmarks", {
      bookmarks: [{ videoId: video.id, text: "단어" }],
    });
    const { items } = await json(
      await rpc(request, "bookmarks/listBookmarks", { videoId: video.id }),
    );

    const textResponse = await rpc(request, "bookmarks/updateBookmark", {
      id: items[0].id,
      text: "단어들",
    });
    expect(textResponse.ok()).toBe(false);

    const notesResponse = await rpc(request, "bookmarks/updateBookmark", {
      id: items[0].id,
      notes: "still editable",
    });
    expect(notesResponse.ok()).toBe(true);
  });
});
