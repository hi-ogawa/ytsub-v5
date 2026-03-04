import { expect, test } from "@playwright/test";

const rpc = (request: any, path: string, data: any = {}) =>
  request.post(`/api/${path.replace(/\./g, "/")}`, {
    headers: { "Content-Type": "application/json" },
    data: { json: data },
  });

const json = async (res: any) => {
  const body = await res.json();
  return body.json;
};

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.post("/api/health", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json.ok).toBe(true);
  expect(typeof body.json.videos).toBe("number");
});

test.describe("video list and navigation", () => {
  let videoId: number;

  test.beforeAll(async ({ request }) => {
    const video = await json(
      await rpc(request, "videos/createVideo", {
        youtubeId: `nav-test-${Date.now()}`,
        title: "Navigation Test Video",
        channelName: "Test Channel",
        duration: 120,
      }),
    );
    videoId = video.id;
  });

  test.afterAll(async ({ request }) => {
    await rpc(request, "videos/deleteVideo", { id: videoId });
  });

  test("video list page shows video cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Videos");
    const card = page.getByRole("link", { name: /Navigation Test Video/ });
    await expect(card).toBeVisible();
    await expect(card.getByText("Test Channel")).toBeVisible();
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("2:00")).toBeVisible();
  });

  test("clicking a video card navigates to viewer", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Navigation Test Video").click();
    await expect(page).toHaveURL(`/videos/${videoId}`);
    await expect(page.locator("h1")).toHaveText(`Video ${videoId}`);
  });

  test("viewer back link returns to video list", async ({ page }) => {
    await page.goto(`/videos/${videoId}`);
    await page.getByText("← Back to videos").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toHaveText("Videos");
  });
});
