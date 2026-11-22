import { expect } from "@playwright/test";
import { SEED_YOUTUBE_ID } from "../helper";
import { createBookmarkAt, openPanelWithTracks, test } from "./helper";

test("AI pick prompt: copy and import with markdown fence", async ({
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://www.youtube.com",
  });
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await host.getByTitle("Settings").click();

  // Copy pick prompt
  await expect(host.getByText("AI prompt")).toBeVisible();
  await host.getByTitle("Copy prompt").click();
  const clipboard = await ytPage.evaluate(() => navigator.clipboard.readText());
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
  ytPage.on("dialog", (dialog) => {
    if (dialog.type() === "prompt") {
      dialog.accept(wrapped);
    } else {
      dialog.accept();
    }
  });
  await host.getByText("Import AI result").click();

  // Verify bookmarks created
  const panel = host.getByTestId("resizable-panel");
  await panel.getByRole("button", { name: /Bookmarks/ }).click();
  await expect(host.locator("[data-bookmark-id]")).toHaveCount(2);
  await expect(
    host.locator("[data-bookmark-id]").first().getByText("to pinch"),
  ).toBeVisible();
});

test("AI fill prompt: copy and import updates existing bookmark", async ({
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://www.youtube.com",
  });
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // Create a bookmark first
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  // Verify unfilled state
  const panel = host.getByTestId("resizable-panel");
  await panel.getByRole("button", { name: /Bookmarks/ }).click();
  await expect(host.getByText("unfilled")).toBeVisible();
  const bookmarkId = await host
    .locator("[data-bookmark-id]")
    .first()
    .getAttribute("data-bookmark-id");

  // Copy fill prompt
  await host.getByTitle("Settings").click();
  const aiSelect = host.locator("select").last();
  await aiSelect.selectOption("fill");
  const clipboard = await ytPage.evaluate(() => navigator.clipboard.readText());
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
  ytPage.on("dialog", (dialog) => {
    if (dialog.type() === "prompt") {
      dialog.accept(json);
    } else {
      dialog.accept();
    }
  });
  await host.getByText("Import AI result").click();

  // Verify translation appears and unfilled badge is gone
  await expect(host.getByText("to pinch")).toBeVisible();
  await expect(host.getByText("unfilled")).not.toBeVisible();

  // The caption popover shows the filled translation and notes
  await panel.getByRole("button", { name: /Captions/ }).click();
  await host
    .locator("[data-index='0']")
    .getByTestId("bookmark-highlight")
    .first()
    .click();
  const popover = host.getByTestId("bookmark-popover");
  await expect(popover.getByText("to pinch")).toBeVisible();
  await expect(popover.getByText("Figurative use.")).toBeVisible();
});

test("AI align prompt: copy and import replaces rows, moves bookmarks, and adds new ones", async ({
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://www.youtube.com",
  });
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  const panel = host.getByTestId("resizable-panel");
  await panel.getByRole("button", { name: /Bookmarks/ }).click();
  const bookmarkId = await host
    .locator("[data-bookmark-id]")
    .first()
    .getAttribute("data-bookmark-id");
  await panel.getByRole("button", { name: /Captions/ }).click();

  // Copy align prompt
  await host.getByTitle("Settings").click();
  await host.locator("select").last().selectOption("fix-asr");
  const clipboard = await ytPage.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Zamak Task: Fix & Align ASR");
  expect(clipboard).toContain(`ID: ${SEED_YOUTUBE_ID}`);
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
  ytPage.on("dialog", (dialog) => {
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
    bookmarks: [{ id: bookmarkId, captionIndex: 1, offset: 0, text: "꼬집어" }],
  });
  await host.getByText("Import AI result").click();
  await expect.poll(() => dialogs.at(-1)).toContain("Nothing imported");
  await expect(host.locator("[data-index='0']")).toContainText("꼬집어 봐");

  answer = JSON.stringify({
    type: "fix-asr",
    captions,
    bookmarks: [
      { id: bookmarkId, captionIndex: 1, offset: 3, text: "꼬집어" },
      { captionIndex: 0, offset: 2, text: "줄", translation: "line" },
    ],
  });
  await host.getByTitle("Settings").click();
  await host.getByText("Import AI result").click();
  await expect.poll(() => dialogs.at(-1)).toContain("Replaced captions");
  await expect(host.locator("[data-index='2']")).toHaveCount(0);
  await expect(host.locator("[data-index='0']")).toHaveText(/새 줄/);
  await expect(
    host.locator("[data-index='1']").getByTestId("bookmark-highlight"),
  ).toHaveText("꼬집어");
  await expect(
    host.locator("[data-index='0']").getByTestId("bookmark-highlight"),
  ).toHaveText("줄");
});
