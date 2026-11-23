import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, SEED_YOUTUBE_ID, setupDb } from "./helper.ts";

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

test("import JSON file adds video to list with captions and bookmarks", async ({
  page,
}) => {
  const fixturePath = path.resolve(
    `scripts/db-seed-json/${SEED_YOUTUBE_ID}/import.json`,
  );

  await setupDb({ seed: true });
  await login(page, { username: "dev-empty" });

  // Open import dialog from header menu
  await page.getByTestId("header-menu").click();
  await page.getByRole("menuitem", { name: "Import" }).click();
  const importDialog = page.getByTestId("import-dialog");
  await expect(importDialog).toBeVisible();

  // Upload shows preview
  await page.getByTestId("file-input").setInputFiles(fixturePath);
  await expect(page.getByText("cloud palace")).toBeVisible();
  await expect(page.getByText(/\d+ captions/)).toBeVisible();
  await expect(page.getByText(/\d+ bookmarks/)).toBeVisible();

  // Confirm import — dialog closes, video appears in list
  await importDialog.getByRole("button", { name: "Import" }).click();
  await expect(importDialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: /cloud palace/ })).toBeVisible();

  // Navigate to viewer — session loaded from IndexedDB
  await page.goto(`/videos/${SEED_YOUTUBE_ID}`);
  await expect(page.locator("[data-index='0']")).toBeVisible();
  await expect(
    page
      .locator("[data-index='0']")
      .getByText("꼬집어 봐 뜬 꿈인 것 같아", { exact: false }),
  ).toBeVisible();

  // Bookmarks tab shows imported bookmarks
  await page.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(page.locator("[data-bookmark-id]").first()).toBeVisible();
});

test("layout starts as a list on a phone and remembers the switch", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const card = page.getByRole("link", { name: /cloud palace/ });
  const listButton = page.getByRole("button", { name: "List" });
  const gridButton = page.getByRole("button", { name: "Grid" });
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  expect((await card.locator("img").boundingBox())!.width).toBeLessThan(200);

  await gridButton.click();
  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  expect((await card.locator("img").boundingBox())!.width).toBeGreaterThan(300);
});
