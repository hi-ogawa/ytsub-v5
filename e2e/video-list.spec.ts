import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test("bootstrap fixtures seeds video index", async ({ page }) => {
  await setupDb();
  await login(page);
  await page.goto("/");
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

  // Click bootstrap from header menu
  await page.getByTestId("header-menu").click();
  await page.getByTestId("bootstrap-fixtures").click();

  // All 3 fixture videos should appear in the video index
  await expect(page.getByTestId("video-card-7GU_VQfgMT0")).toBeVisible();
  await expect(page.getByTestId("video-card-aK8Yh3RTBUY")).toBeVisible();
  await expect(page.getByTestId("video-card-DtK-CkwNHSY")).toBeVisible();
});

test("video card shows thumbnail and channel, clicking navigates to viewer", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page);

  const card = page.getByRole("link", {
    name: /cloud palace/,
  });
  await expect(card).toBeVisible();
  const thumbnail = card.locator("img");
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveAttribute(
    "src",
    /img\.youtube\.com\/vi\/.+\/mqdefault\.jpg/,
  );
  await expect(card.locator("p", { hasText: "Billlie" })).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/videos\/.+/);
});

test("cancel then confirm delete video", async ({ page }) => {
  await setupDb({ seed: true });
  await login(page);

  const card = page.getByRole("link", { name: /cloud palace/ });
  await expect(card).toBeVisible();

  const menuTrigger = card.getByTestId("video-card-menu");
  page.once("dialog", (dialog) => dialog.dismiss());
  await menuTrigger.click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await expect(card).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await menuTrigger.click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await expect(card).not.toBeVisible();
});

test("no sync badges when unauthenticated", async ({ page }) => {
  await page.goto("/dev");

  // Bootstrap fixtures to populate video index
  await page.getByTestId("header-menu").click();
  await page.getByTestId("bootstrap-fixtures").click();

  await expect(page.getByTestId("video-card-7GU_VQfgMT0")).toBeVisible();
  await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
});
