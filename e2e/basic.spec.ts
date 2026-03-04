import { expect, test } from "@playwright/test";

test("app loads and connects to server", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("ytsub");
  await expect(page.getByText(/connected —/)).toBeVisible();
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
