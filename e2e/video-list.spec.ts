import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

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
    "scripts/db-seed-json/7GU_VQfgMT0/import.json",
  );

  await setupDb({ seed: true });
  await login(page, { username: "dev-empty" });

  // Open import dialog from header menu
  await page.getByTestId("header-menu").click();
  await page.getByText("Import").click();
  await expect(page.getByText("Import Video")).toBeVisible();

  // Upload shows preview
  await page.getByTestId("file-input").setInputFiles(fixturePath);
  await expect(page.getByText("cloud palace")).toBeVisible();
  await expect(page.getByText(/\d+ captions/)).toBeVisible();
  await expect(page.getByText(/\d+ bookmarks/)).toBeVisible();

  // Confirm import — dialog closes, video appears in list
  await page
    .locator("[role=dialog], .fixed")
    .getByRole("button", { name: "Import" })
    .click();
  await expect(page.getByText("Import Video")).not.toBeVisible();
  await expect(page.getByRole("link", { name: /cloud palace/ })).toBeVisible();

  // Navigate to viewer — session loaded from IndexedDB
  await page.goto("/videos/7GU_VQfgMT0");
  await expect(page.locator("[data-index='0']")).toBeVisible();
  await expect(
    page
      .locator("[data-index='0']")
      .getByText("꼬집어 봐 뜬 꿈인 것 같아", { exact: false }),
  ).toBeVisible();

  // Bookmarks tab shows imported bookmarks
  await page.getByRole("button", { name: /Bookmarks/ }).click();
  await expect(page.locator("[data-bookmark-id]").first()).toBeVisible();
});

test("no sync badges when unauthenticated", async ({ page }) => {
  await page.goto("/dev");
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

  // Bootstrap fixtures to populate video index
  await page.getByTestId("header-menu").click();
  await page.getByTestId("bootstrap-fixtures").click();

  await expect(page.getByTestId("video-card-7GU_VQfgMT0")).toBeVisible();
  await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
});
