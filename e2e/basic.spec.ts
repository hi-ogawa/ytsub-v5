import { expect, test } from "@playwright/test";

test("app loads and connects to server", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("ytsub");
  await expect(page.getByText("connected")).toBeVisible({ timeout: 15000 });
});

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.post("/rpc/health", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toEqual({ json: { ok: true } });
});

test("database has expected tables", async ({ request }) => {
  const res = await request.post("/rpc/dbHealth", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json.tables).toContain("videos");
  expect(body.json.tables).toContain("captions");
  expect(body.json.tables).toContain("bookmarks");
});
