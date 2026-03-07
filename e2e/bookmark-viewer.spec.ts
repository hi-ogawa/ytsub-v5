import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("bookmark viewer", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    // Wait for captions to load
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("shows tab bar with captions and bookmarks tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Captions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bookmarks/ })).toBeVisible();
    // Bookmark count shown in tab
    await expect(
      page.getByRole("button", { name: /Bookmarks \(\d+\)/ }),
    ).toBeVisible();
  });

  test("switches to bookmarks tab and shows bookmark list", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // First bookmark by timestamp should be 꼬집어
    await expect(page.getByText("꼬집어").first()).toBeVisible();
    await expect(page.getByText("to pinch").first()).toBeVisible();
  });

  test("bookmark highlight and popover", async ({ page }) => {
    // Caption idx=0 has bookmark 꼬집어 — highlighted with amber underline
    const firstRow = page.locator("[data-index='0']");
    const highlight = firstRow.locator("span.border-amber-400");
    await expect(highlight.first()).toBeVisible();
    await expect(highlight.first()).toHaveText("꼬집어");

    // Hover shows popover with translation and etymology
    await highlight.first().hover({ force: true });
    await expect(page.getByText("to pinch")).toBeVisible();
    await expect(page.getByText("掐")).toBeVisible();
  });

  test("popover does not show notes", async ({ page }) => {
    // Caption idx=0 has bookmark 꼬집어 with notes but no etymology
    const firstRow = page.locator("[data-index='0']");
    const highlight = firstRow.locator("span.border-amber-400").first();
    await highlight.hover({ force: true });
    // Translation should show
    await expect(page.getByText("to pinch")).toBeVisible();
    // Notes should NOT be in the popover
    await expect(
      page.getByText("pinch oneself to check if dreaming"),
    ).not.toBeVisible();
  });

  test("bookmark list shows etymology and notes", async ({ page }) => {
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // 미로 has etymology 迷路
    await expect(page.getByText("迷路").first()).toBeVisible();
    // 초침 has etymology 秒針 and notes
    await expect(page.getByText("秒針").first()).toBeVisible();
    await expect(
      page.getByText("흐르는 초침 = flowing/ticking second hand").first(),
    ).toBeVisible();
  });

  test("bookmark list shows caption context", async ({ page }) => {
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // Caption context from idx=0 text1
    await expect(
      page.getByText("꼬집어 봐 뜬 꿈인 것 같아").first(),
    ).toBeVisible();
  });

  test("captions tab preserves scroll after switching tabs", async ({
    page,
  }) => {
    // Captions should be visible initially
    await expect(page.locator("[data-index='0']")).toBeVisible();
    // Switch to bookmarks
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("꼬집어").first()).toBeVisible();
    // Switch back to captions — should still show content
    await page.getByRole("button", { name: "Captions" }).click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("shows prev/next bookmark navigation buttons", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Previous bookmark" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next bookmark" }),
    ).toBeVisible();
  });

  test("manual bookmarking via text selection", async ({ page }) => {
    // Select text in caption at idx=2 (text1: '널 향한 short cut', no existing bookmarks)
    const row = page.locator("[data-index='2']");
    await expect(row).toBeVisible();

    // Programmatically select "향한" within data-side="0" span
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='2']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      // Select "향한" (chars 2-4 in '널 향한 short cut')
      range.setStart(textNode, 2);
      range.setEnd(textNode, 4);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });

    // FAB should appear
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Click bookmark button
    await page.getByRole("button", { name: "Create bookmark" }).click();

    // FAB should disappear
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).not.toBeVisible();

    // New manual bookmark highlight should appear on the caption row (sky color)
    const highlight = row.locator("span.border-sky-400");
    await expect(highlight.first()).toBeVisible();
    await expect(highlight.first()).toHaveText("향한");

    // Bookmark should appear in the bookmarks tab
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("향한").first()).toBeVisible();
  });

  test("caption go-to-bookmark link in popover switches to bookmarks tab", async ({
    page,
  }) => {
    // Hover on highlighted bookmark word in caption at idx=0
    const row = page.locator("[data-index='0']");
    const highlight = row.locator("span.border-amber-400").first();
    await highlight.hover({ force: true });
    // Click "Go to bookmark" link in popover
    const goBtn = page.getByRole("button", { name: "Go to bookmark" });
    await expect(goBtn).toBeVisible();
    await goBtn.dispatchEvent("mousedown");
    // Should switch to bookmarks tab and show the bookmark
    await expect(page.getByRole("button", { name: /Bookmarks/ })).toHaveClass(
      /font-medium/,
    );
    await expect(page.getByText("꼬집어").first()).toBeVisible();
  });

  test("bookmark go-to-caption button switches to captions tab", async ({
    page,
  }) => {
    // Switch to bookmarks tab
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // Click "Go to caption" on the first bookmark
    const goBtn = page.getByRole("button", { name: "Go to caption" }).first();
    await expect(goBtn).toBeVisible();
    await goBtn.click();
    // Should switch back to captions tab
    await expect(page.getByRole("button", { name: "Captions" })).toHaveClass(
      /font-medium/,
    );
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("cancel text selection hides FAB", async ({ page }) => {
    // Select text in caption at idx=3
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='3']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).toBeVisible();

    // Click cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // FAB should disappear
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).not.toBeVisible();
  });
});
