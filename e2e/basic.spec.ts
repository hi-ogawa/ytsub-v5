import { expect, test } from "@playwright/test";

test("app loads and shows video list", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav").getByText("ytsub")).toBeVisible();
  await expect(page.getByText(/Videos \(\d+\)/)).toBeVisible();
  await expect(
    page.getByText("PSY - GANGNAM STYLE(강남스타일) M/V"),
  ).toBeVisible();
});

test("navigate to video viewer and back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("PSY - GANGNAM STYLE(강남스타일) M/V").click();
  await expect(page.getByText("← Videos")).toBeVisible();
  await expect(page.getByText("officialpsy")).toBeVisible();
  // back to list
  await page.getByText("← Videos").click();
  await expect(page.getByText(/Videos \(\d+\)/)).toBeVisible();
});

test("health endpoint returns ok with videos count", async ({ request }) => {
  const res = await request.post("/api/health", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.json).toEqual({ ok: true, videos: 0 });
});
