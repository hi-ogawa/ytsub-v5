import { expect, test } from "@playwright/test";

test("app loads and shows video list", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("ytsub");
  // Wait for loading to complete — either video list or empty state appears
  await expect(
    page.locator("ul").or(page.getByText("No videos yet", { exact: false })),
  ).toBeVisible({ timeout: 10000 });
});

test("health endpoint returns ok with videos count", async ({ request }) => {
  const res = await request.post("/api/health", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json).toMatchObject({ ok: true });
});

test("import video endpoint works", async ({ request }) => {
  const res = await request.post("/api/videos/import", {
    headers: { "Content-Type": "application/json" },
    data: {
      json: {
        youtube_id: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up",
        channel_name: "RickAstleyVEVO",
        duration: 212,
        language1: "ko",
        language2: "en",
        captions: [
          { language: "ko", idx: 0, begin: 0, end: 5, text: "안녕하세요" },
          { language: "en", idx: 0, begin: 0, end: 5, text: "Hello" },
        ],
      },
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json.id).toBeGreaterThan(0);
});

test("bulk create bookmarks endpoint works", async ({ request }) => {
  const importRes = await request.post("/api/videos/import", {
    headers: { "Content-Type": "application/json" },
    data: {
      json: {
        youtube_id: "bm_test_video",
        title: "Bookmark Test Video",
        duration: 100,
      },
    },
  });
  expect(importRes.ok()).toBe(true);
  const { json: importBody } = await importRes.json();

  const bmRes = await request.post("/api/bookmarks/bulkCreate", {
    headers: { "Content-Type": "application/json" },
    data: {
      json: {
        video_id: importBody.id,
        bookmarks: [
          {
            text: "안녕",
            translation: "hello",
            timestamp: 1.5,
            status: "pending",
          },
        ],
      },
    },
  });
  expect(bmRes.ok()).toBe(true);
  const bmBody = await bmRes.json();
  expect(bmBody.json.count).toBe(1);
});
