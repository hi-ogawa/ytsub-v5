import { expect, type Locator } from "@playwright/test";
import { OTHER_VIDEO_ID, SEED_VIDEO_ID } from "../helper";
import { openPanelWithTracks, openYouTubeTab, test } from "./helper";

test("FAB toggles the panel and keeps its state per video across reloads", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  await expect(host.locator("[data-index='5']")).toBeVisible();
  const row = host.locator("[data-index='0']");
  await expect(row.locator("text=/\\d+:\\d{2} – \\d+:\\d{2}/")).toBeVisible();
  const cols = row.locator(".flex-1");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).not.toHaveText("");
  await expect(cols.nth(1)).not.toHaveText("");

  // The panel reopens with its tracks after a reload
  await ytPage.reload();
  await expect(host.locator("[data-index='0']")).toBeVisible();

  // Another video starts closed, and the first one stays open
  await ytPage.goto(`https://www.youtube.com/watch?v=${OTHER_VIDEO_ID}`);
  await expect(host.getByTitle("Show captions")).toBeVisible();
  await ytPage.goto(`https://www.youtube.com/watch?v=${SEED_VIDEO_ID}`);
  await expect(host.getByTitle("Hide captions")).toBeVisible();

  await host.getByTitle("Hide captions").click();
  await expect(host.locator("[data-index='0']")).not.toBeVisible();
  await ytPage.reload();
  await expect(host.getByTitle("Show captions")).toBeVisible();
});

test("track selection: default empty, select tracks, switch language", async ({
  context,
}) => {
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  const host = ytPage.locator("#zamak-host");
  await host.getByTestId("caption-fab").click();

  const selects = host.getByTestId("track-picker").locator("select");
  await expect(selects.nth(0)).toHaveValue("");
  await expect(selects.nth(1)).toHaveValue("");
  await expect(host.locator("[data-index='0']")).not.toBeVisible();

  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(host.locator("[data-index='0']")).toBeVisible();

  const firstRowText = await host.locator("[data-index='0']").textContent();
  await selects.nth(1).selectOption(".ja");
  await expect(host.locator("[data-index='0']")).not.toHaveText(firstRowText!);
});

test("auto-scroll toggle persists across reload", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  const autoScrollItem = host.locator("[data-checked]");

  await host.getByTitle("Settings").click();
  await expect(autoScrollItem).toHaveAttribute("data-checked", "true");
  await ytPage.keyboard.press("Escape");
  await expect(host.getByText("Auto-scroll")).not.toBeVisible();

  // The menu stays open when toggling
  await host.getByTitle("Settings").click();
  await host.getByText("Auto-scroll").click();
  await expect(autoScrollItem).toHaveAttribute("data-checked", "false");

  await ytPage.reload();
  await expect(host.locator("[data-index='0']")).toBeVisible();
  await host.getByTitle("Settings").click();
  await expect(autoScrollItem).toHaveAttribute("data-checked", "false");
});

test("strategy dropdown switches merge strategy", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  const strategySelect = host.locator("select[title='Alignment strategy']");

  await host.getByTitle("Settings").click();
  await expect(strategySelect).toHaveValue("partition");
  await ytPage.keyboard.press("Escape");
  const partitionCount = await host.locator("[data-index]").count();

  await host.getByTitle("Settings").click();
  await strategySelect.selectOption("overlap");
  await ytPage.keyboard.press("Escape");
  await expect(host.locator("[data-index='0']")).toBeVisible();
  expect(await host.locator("[data-index]").count()).toBeGreaterThan(
    partitionCount,
  );

  await host.getByTitle("Settings").click();
  await strategySelect.selectOption("best-overlap");
  await ytPage.keyboard.press("Escape");
  await expect(host.locator("[data-index='0']")).toBeVisible();
});

test("export downloads valid import.json", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);

  await host.getByTitle("Settings").click();
  const [download] = await Promise.all([
    ytPage.waitForEvent("download"),
    host.getByText("Export import.json").click(),
  ]);
  expect(download.suggestedFilename()).toBe(`import-${SEED_VIDEO_ID}.json`);

  const content = await (
    await download.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks).toString());
  const data = JSON.parse(content);
  expect(data).toMatchObject({
    video: {
      youtubeId: SEED_VIDEO_ID,
      title: "Billlie | 'cloud palace' 𝐁efore sunrise live",
      channelName: "Billlie",
      channelId: "UCyc9sUCxELTDK9vELO5Fzeg",
      duration: 210,
      language1: "ko",
      language2: "en",
    },
    bookmarks: [],
  });
  expect(data.captions).toHaveLength(56);
  expect(data.captions[0]).toEqual({
    idx: 0,
    begin: 25.714,
    end: 29.621,
    text1: "꼬집어 봐 뜬 꿈인 것 같아",
    text2: "am I awake? or am I still dreaming",
  });
  expect(data.captions[55]).toEqual({
    idx: 55,
    begin: 197.448,
    end: 201.542,
    text1: "날 부른 이름 듣고 있으니까",
    text2: "I’m hearing my name you left in the wind",
  });
});

test("panel left edge can be dragged to resize", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  const panel = host.getByTestId("resizable-panel");
  expect(await getWidth(panel)).toBe(400);

  const handleBox = (await host.getByTestId("resize-handle").boundingBox())!;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await ytPage.mouse.move(startX, startY);
  await ytPage.mouse.down();
  await ytPage.mouse.move(startX - 100, startY, { steps: 5 });
  await ytPage.mouse.up();
  expect(await getWidth(panel)).toBe(500);

  await host.getByTitle("Hide captions").click();
  await host.getByTitle("Show captions").click();
  await expect(host.locator("[data-index='0']")).toBeVisible();
  expect(await getWidth(panel)).toBe(500);
});

async function getWidth(locator: Locator) {
  return (await locator.boundingBox())!.width;
}
