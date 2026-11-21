import { expect, test } from "@playwright/test";
import { createBookmarkAt, openPanelWithTracks } from "./helper.ts";

test.describe("dev-viewer AI prompts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/videos/7GU_VQfgMT0");
  });

  test("AI pick prompt: copy and import with markdown fence", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPanelWithTracks(page);
    await page.getByTitle("Settings").click();

    // Copy pick prompt
    await expect(page.getByText("AI prompt")).toBeVisible();
    await page.getByTitle("Copy prompt").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Zamak Task: Pick & Fill");
    expect(clipboard).toContain("skills/zamak/SKILL.md");
    expect(clipboard).toContain("cloud palace");
    expect(clipboard).toContain("꼬집어 봐 뜬 꿈인 것 같아");

    // Import result wrapped in markdown code fence
    const wrapped = `\`\`\`json
{"type": "pick-fill", "entries": [
  {"captionIndex": 0, "text": "꼬집어", "translation": "to pinch", "etymology": "" },
  {"captionIndex": 1, "text": "밤새", "translation": "all night", "etymology": "" }]}
\`\`\``;
    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") {
        dialog.accept(wrapped);
      } else {
        dialog.accept();
      }
    });
    await page.getByText("Import AI result").click();

    // Verify bookmarks created
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]")).toHaveCount(2);
    await expect(
      page.locator("[data-bookmark-id]").first().getByText("to pinch"),
    ).toBeVisible();
  });

  test("AI fill prompt: copy and import updates existing bookmark", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPanelWithTracks(page);

    // Create a bookmark first
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Verify unfilled state
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("unfilled")).toBeVisible();
    const bookmarkId = await page
      .locator("[data-bookmark-id]")
      .first()
      .getAttribute("data-bookmark-id");

    // Copy fill prompt
    await page.getByTitle("Settings").click();
    const aiSelect = page.locator("select").last();
    await aiSelect.selectOption("fill");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Zamak Task: Fill Bookmarks");
    expect(clipboard).toContain("꼬집어");

    // Import fill result
    const json = JSON.stringify({
      type: "fill",
      entries: [
        {
          id: bookmarkId,
          translation: "to pinch",
          etymology: "",
          notes: "Figurative use.",
        },
      ],
    });
    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") {
        dialog.accept(json);
      } else {
        dialog.accept();
      }
    });
    await page.getByText("Import AI result").click();

    // Verify translation appears and unfilled badge is gone
    await expect(page.getByText("to pinch")).toBeVisible();
    await expect(page.getByText("unfilled")).not.toBeVisible();

    // The caption popover shows the filled translation and notes
    await panel.getByRole("button", { name: /Captions/ }).click();
    await page
      .locator("[data-index='0']")
      .getByTestId("bookmark-highlight")
      .first()
      .click();
    const popover = page.getByTestId("bookmark-popover");
    await expect(popover.getByText("to pinch")).toBeVisible();
    await expect(popover.getByText("Figurative use.")).toBeVisible();
  });

  test("AI align prompt: copy and import replaces rows, moves bookmarks, and adds new ones", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    const bookmarkId = await page
      .locator("[data-bookmark-id]")
      .first()
      .getAttribute("data-bookmark-id");
    await panel.getByRole("button", { name: /Captions/ }).click();

    // Copy align prompt
    await page.getByTitle("Settings").click();
    await page.locator("select").last().selectOption("fix-asr");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Zamak Task: Fix & Align ASR");
    expect(clipboard).toContain("ID: 7GU_VQfgMT0");
    expect(clipboard).toContain("skills/zamak/SKILL.md");
    expect(clipboard).toContain("`.ko`: ko, manual, current text1");
    expect(clipboard).toContain(bookmarkId!);
    expect(clipboard).not.toContain("밤새");

    const captions = [
      { begin: 0, end: 2, text1: "새 줄", text2: "new line" },
      { begin: 2, end: 4, text1: "다시 꼬집어 봐", text2: "pinch again" },
    ];
    const dialogs: string[] = [];
    let answer = "";
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      if (dialog.type() === "prompt") {
        dialog.accept(answer);
      } else {
        dialog.accept();
      }
    });

    // A bookmark that isn't at its offset rejects the whole result
    answer = JSON.stringify({
      type: "fix-asr",
      captions,
      bookmarks: [
        { id: bookmarkId, captionIndex: 1, offset: 0, text: "꼬집어" },
      ],
    });
    await page.getByText("Import AI result").click();
    await expect.poll(() => dialogs.at(-1)).toContain("Nothing imported");
    await expect(page.locator("[data-index='0']")).toContainText("꼬집어 봐");

    answer = JSON.stringify({
      type: "fix-asr",
      captions,
      bookmarks: [
        { id: bookmarkId, captionIndex: 1, offset: 3, text: "꼬집어" },
        { captionIndex: 0, offset: 2, text: "줄", translation: "line" },
      ],
    });
    await page.getByTitle("Settings").click();
    await page.getByText("Import AI result").click();
    await expect.poll(() => dialogs.at(-1)).toContain("Replaced captions");
    await expect(page.locator("[data-index='2']")).toHaveCount(0);
    await expect(page.locator("[data-index='0']")).toHaveText(/새 줄/);
    await expect(
      page.locator("[data-index='1']").getByTestId("bookmark-highlight"),
    ).toHaveText("꼬집어");
    await expect(
      page.locator("[data-index='0']").getByTestId("bookmark-highlight"),
    ).toHaveText("줄");
  });
});
