import { expect, type Page, test } from "@playwright/test";
import { login } from "./helper.ts";

async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

async function createBookmarkAt(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await page.evaluate(
    ({ index, start, end }) => {
      const sideEl = document
        .querySelector(`[data-index='${index}']`)!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { index, start, end },
  );
  await page.getByRole("button", { name: "Create bookmark" }).click();
}

async function openSettings(page: Page) {
  await page.getByTitle("Settings").click();
}

test.describe("AI prompt copy & import", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await openPanelWithTracks(page);
  });

  test("copy Pick & Fill prompt includes captions and video title", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openSettings(page);

    // AI prompt section visible
    await expect(page.getByText("AI prompt")).toBeVisible();

    // Click copy button
    await page.getByTitle("Copy prompt").click();

    // Read clipboard
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Pick Korean vocabulary");
    expect(clipboard).toContain("cloud palace");
    expect(clipboard).toContain("꼬집어 봐 뜬 꿈인 것 같아");
    expect(clipboard).toContain("captionIndex");
    expect(clipboard).toContain("```json");
  });

  test("copy Fill Bookmarks prompt includes bookmark data", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Create a bookmark first
    await createBookmarkAt(page, 0, 0, 3);

    await openSettings(page);

    // Switch to Fill Bookmarks task
    const aiSelect = page.locator("select").last();
    await aiSelect.selectOption("fill");

    // Read clipboard (selecting auto-copies)
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Fill bookmark metadata");
    expect(clipboard).toContain("꼬집어");
  });

  test("import Pick & Fill JSON creates bookmarks with metadata", async ({
    page,
  }) => {
    const json = JSON.stringify([
      {
        captionIndex: 0,
        text: "꼬집어",
        translation: "to pinch",
        etymology: "",
        notes: "Used figuratively here.",
      },
      {
        captionIndex: 1,
        text: "밤새",
        translation: "all night",
        etymology: "",
        notes: "",
      },
    ]);

    // Handle prompt → accept with JSON, then alert → dismiss
    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") dialog.accept(json);
      else dialog.accept();
    });

    await openSettings(page);
    await page.getByText("Import AI result").click();

    // Verify bookmarks
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]")).toHaveCount(2);

    const firstCard = page.locator("[data-bookmark-id]").first();
    await expect(firstCard.getByText("to pinch")).toBeVisible();
  });

  test("import Fill JSON updates existing bookmarks", async ({ page }) => {
    // Create a bookmark without metadata
    await createBookmarkAt(page, 0, 0, 3);

    // Switch to bookmarks tab to get ID and verify unfilled state
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("unfilled")).toBeVisible();
    const bookmarkId = await page
      .locator("[data-bookmark-id]")
      .first()
      .getAttribute("data-bookmark-id");

    const json = JSON.stringify([
      {
        id: bookmarkId,
        translation: "to pinch",
        etymology: "",
        notes: "Figurative use.",
      },
    ]);

    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") dialog.accept(json);
      else dialog.accept();
    });

    await openSettings(page);
    await page.getByText("Import AI result").click();

    // Verify translation appears and unfilled badge is gone
    await expect(page.getByText("to pinch")).toBeVisible();
    await expect(page.getByText("unfilled")).not.toBeVisible();
  });

  test("import handles JSON wrapped in markdown code fence", async ({
    page,
  }) => {
    const wrapped = `\`\`\`json
[{"captionIndex": 0, "text": "꼬집어", "translation": "to pinch", "etymology": "", "notes": ""}]
\`\`\``;

    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") dialog.accept(wrapped);
      else dialog.accept();
    });

    await openSettings(page);
    await page.getByText("Import AI result").click();

    // Verify bookmark created
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]")).toHaveCount(1);
  });
});
