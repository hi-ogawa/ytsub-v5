import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("delete video", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("cancel then confirm delete video", async ({ page }) => {
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
});

// TODO: delete-bookmark test needs rework — viewer now loads from IndexedDB, not server.
// Bookmark deletion is covered by dev-viewer tests (dev-viewer.spec.ts).
