import { expect, test } from "@playwright/test";

test("app loads and shows video list", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Videos");
});

test("health endpoint returns ok with videos count", async ({ request }) => {
  const res = await request.post("/api/health", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json.ok).toBe(true);
  expect(typeof body.json.videos).toBe("number");
});
