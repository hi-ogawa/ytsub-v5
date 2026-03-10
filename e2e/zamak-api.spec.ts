import { expect, type Page, test } from "@playwright/test";
import { login } from "./helper.ts";

async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

/** Create a bookmark on "꼬집어" in the first caption row */
async function createBookmark(page: Page) {
  await page.evaluate(() => {
    const sideEl = document
      .querySelector("[data-index='0']")!
      .querySelector("[data-side='0']")!;
    const textSpan = sideEl.querySelector("[data-offset]")!;
    const textNode = textSpan.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 3); // "꼬집어"
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole("button", { name: "Create bookmark" }).click();
}

test.describe("window.__zamak API", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await openPanelWithTracks(page);
  });

  test("getVideoContext returns video metadata", async ({ page }) => {
    const ctx = await page.evaluate(() => window.__zamak!.getVideoContext());
    expect(ctx).toMatchObject({
      youtubeId: "7GU_VQfgMT0",
      title: "Billlie | 'cloud palace' 𝐁efore sunrise live",
      language1: "ko",
      language2: "en",
    });
  });

  test("getCaptions returns all caption rows", async ({ page }) => {
    const captions = await page.evaluate(() => window.__zamak!.getCaptions());
    expect(captions.length).toBeGreaterThan(0);
    expect(captions[0]).toMatchObject({
      idx: 0,
      text1: "꼬집어 봐 뜬 꿈인 것 같아",
      text2: "am I awake? or am I still dreaming",
    });
    expect(captions[0].begin).toBeCloseTo(25.714, 1);
  });

  test("updateCaptions fixes text and reflects in DOM", async ({ page }) => {
    // Fix a caption via API
    await page.evaluate(() => {
      window.__zamak!.updateCaptions([
        { idx: 0, text1: "꼬집어 봐 뜬꿈인 것 같아 (fixed)" },
      ]);
    });

    // DOM should reflect the change
    const row = page.locator("[data-index='0'] [data-side='0']");
    await expect(row).toContainText("(fixed)");

    // getCaptions should return updated text
    const caption = await page.evaluate(() => window.__zamak!.getCaptions()[0]);
    expect(caption.text1).toBe("꼬집어 봐 뜬꿈인 것 같아 (fixed)");
    // text2 unchanged
    expect(caption.text2).toBe("am I awake? or am I still dreaming");
  });

  test("fillBookmarks updates bookmark metadata", async ({ page }) => {
    await createBookmark(page);

    // Get the bookmark id
    const bookmarks = await page.evaluate(() => window.__zamak!.getBookmarks());
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].text).toBe("꼬집어");
    expect(bookmarks[0].translation).toBe("");

    // Fill metadata
    await page.evaluate(() => {
      const [bm] = window.__zamak!.getBookmarks();
      window.__zamak!.fillBookmarks([
        {
          id: bm.id,
          translation: "to pinch",
          etymology: "",
          notes: "As in 꼬집어 봐 — pinch me (to check if dreaming)",
        },
      ]);
    });

    // Verify
    const updated = await page.evaluate(() => window.__zamak!.getBookmarks());
    expect(updated[0].translation).toBe("to pinch");
    expect(updated[0].notes).toBe(
      "As in 꼬집어 봐 — pinch me (to check if dreaming)",
    );
  });

  test("getBookmarks includes captionContext with surrounding rows", async ({
    page,
  }) => {
    // Create bookmark on row 1 (not row 0) so there's a row before
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='1']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 2);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.getByRole("button", { name: "Create bookmark" }).click();

    const [bm] = await page.evaluate(() => window.__zamak!.getBookmarks());
    // Should have 3 rows: before, current, after
    expect(bm.captionContext).toHaveLength(3);
    // Each has text1 and text2
    for (const ctx of bm.captionContext) {
      expect(ctx).toHaveProperty("text1");
      expect(ctx).toHaveProperty("text2");
    }
  });

  test("filled bookmark metadata appears in export", async ({ page }) => {
    await createBookmark(page);

    // Fill via API
    await page.evaluate(() => {
      const [bm] = window.__zamak!.getBookmarks();
      window.__zamak!.fillBookmarks([
        {
          id: bm.id,
          translation: "to pinch",
          etymology: "",
          notes: "꼬집어 봐 = pinch me",
        },
      ]);
    });

    // Export and check
    await page.getByTitle("Settings").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Export import.json").click(),
    ]);
    const content = await (
      await download.createReadStream()
    )
      .toArray()
      .then((chunks) => Buffer.concat(chunks).toString());
    const data = JSON.parse(content);

    expect(data.bookmarks).toHaveLength(1);
    expect(data.bookmarks[0]).toMatchObject({
      text: "꼬집어",
      translation: "to pinch",
      notes: "꼬집어 봐 = pinch me",
    });
  });
});
