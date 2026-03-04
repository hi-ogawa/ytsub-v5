import { exec } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execAsync = promisify(exec);

test.beforeAll(async () => {
  await execAsync("pnpm db:clear && pnpm db:seed");
});

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
  test("video list page shows video cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Videos");
    const card = page.getByRole("link", {
      name: /한국어 회화 연습 - 일상 대화/,
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("한국어 교실")).toBeVisible();
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("7:00")).toBeVisible();
  });

  test("clicking a video card navigates to viewer", async ({ page }) => {
    await page.goto("/");
    await page.getByText("한국어 회화 연습 - 일상 대화").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("h1")).toContainText("Video");
  });

  test("viewer back link returns to video list", async ({ page }) => {
    await page.goto("/");
    await page.getByText("한국어 회화 연습 - 일상 대화").click();
    await expect(page.locator("h1")).toContainText("Video");
    await page.getByText("← Back to videos").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toHaveText("Videos");
  });
});
