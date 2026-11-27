import { expect, type Locator } from "@playwright/test";
import { OTHER_YOUTUBE_ID, SEED_YOUTUBE_ID } from "../helper";
import {
  createBookmarkAt,
  openPanelWithTracks,
  openYouTubeTab,
  test,
} from "./helper";

test("FAB toggles the panel and keeps its state per video across reloads", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await expect(host.locator("[data-index='5']")).toBeVisible();
  const row = host.locator("[data-index='0']");
  await expect(row.locator("text=/\\d+:\\d{2} – \\d+:\\d{2}/")).toBeVisible();
  const cols = row.locator("[data-side]");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).not.toHaveText("");
  await expect(cols.nth(1)).not.toHaveText("");

  // The panel reopens with its tracks after a reload
  await ytPage.reload();
  await expect(host.locator("[data-index='0']")).toBeVisible();

  // Another video starts closed, and the first one stays open
  await ytPage.goto(`https://www.youtube.com/watch?v=${OTHER_YOUTUBE_ID}`);
  await expect(host.getByTitle("Show captions")).toBeVisible();
  await ytPage.goto(`https://www.youtube.com/watch?v=${SEED_YOUTUBE_ID}`);
  await expect(host.getByTitle("Hide captions")).toBeVisible();

  await host.getByTitle("Hide captions").click();
  await expect(host.locator("[data-index='0']")).not.toBeVisible();
  await ytPage.reload();
  await expect(host.getByTitle("Show captions")).toBeVisible();
});

test("clicking a row seeks to its start and plays, and clicking the current row pauses", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const video = ytPage.locator("video");
  const isPaused = () =>
    video.evaluate((element: HTMLVideoElement) => element.paused);
  const getCurrentTime = () =>
    video.evaluate((element: HTMLVideoElement) => element.currentTime);

  const row = host.locator("[data-index='2']");
  await row.click();
  await expect.poll(isPaused).toBe(false);
  expect(await getCurrentTime()).toBe(35.597);

  await expect(row).toHaveAttribute("aria-current", "true");
  await row.click();
  await expect.poll(isPaused).toBe(true);
  await row.click();
  await expect.poll(isPaused).toBe(false);
});

test("repeat replays a row from its start until another row is clicked", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const video = ytPage.locator("video");
  const isPaused = () =>
    video.evaluate((element: HTMLVideoElement) => element.paused);
  const getCurrentTime = () =>
    video.evaluate((element: HTMLVideoElement) => element.currentTime);
  // The mock video has no source, so its time moves only when set by hand.
  const setCurrentTime = (time: number) =>
    video.evaluate(
      (element: HTMLVideoElement, t) => (element.currentTime = t),
      time,
    );

  // Row 2 spans 35.597–38.206
  const repeat = host.locator("[data-index='2']").getByTitle("Repeat");
  await repeat.click();
  await expect(repeat).toHaveAttribute("aria-pressed", "true");
  await expect.poll(isPaused).toBe(false);
  expect(await getCurrentTime()).toBe(35.597);

  await setCurrentTime(38.206);
  await expect.poll(getCurrentTime).toBe(35.597);

  await host.locator("[data-index='3']").click();
  await expect(repeat).toHaveAttribute("aria-pressed", "false");
  expect(await getCurrentTime()).toBe(38.206);
});

test("track selection: default empty, select tracks, switch language", async ({
  context,
}) => {
  const ytPage = await openYouTubeTab(context, SEED_YOUTUBE_ID);
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

test("a session's track that the list lacks shows as an option", async ({
  context,
  extensionId,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // English has its own track, so the list builds no translation into it
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/bookmarks.html`);
  await extensionPage.evaluate(async (youtubeId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("zamak");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("caption-sessions", "readwrite");
      const store = transaction.objectStore("caption-sessions");
      const request = store.get(youtubeId);
      request.onsuccess = () => {
        store.put({ ...request.result, vssId2: ".ko.t.en" });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, SEED_YOUTUBE_ID);

  await ytPage.reload();
  const selects = host.getByTestId("track-picker").locator("select");
  await expect(selects.nth(0)).toBeEnabled();
  await expect(selects.nth(1)).toHaveValue(".ko.t.en");
  await expect(selects.nth(1).locator("option:checked")).toHaveText(
    "en (translated)",
  );
});

test("auto-scroll toggle persists across reload", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
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

test("text size setting resizes captions and persists across reload", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const caption = host.locator("[data-index='0'] [data-side='0']");
  await expect(caption).toHaveCSS("font-size", "14px");
  await expect(caption).toHaveCSS("line-height", "20px");

  // The menu stays open while stepping
  await host.getByTitle("Settings").click();
  await host.getByRole("menuitem", { name: "Larger text" }).click();
  await host.getByRole("menuitem", { name: "Larger text" }).click();
  await expect(caption).toHaveCSS("font-size", "16px");
  // Line height grows with it rather than staying at 20px
  await expect(caption).toHaveCSS("line-height", "22.8571px");

  await ytPage.reload();
  await expect(caption).toHaveCSS("font-size", "16px");

  // The bookmark popover follows it a step smaller, and bookmark cards follow it
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await host.getByTestId("bookmark-highlight").click();
  await expect(
    host.getByTestId("bookmark-popover").getByText("꼬집어", { exact: true }),
  ).toHaveCSS("font-size", "14px");
  await ytPage.keyboard.press("Escape");
  await host.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(
    host.locator("[data-bookmark-id]").getByText("꼬집어", { exact: true }),
  ).toHaveCSS("font-size", "16px");
});

test("export downloads valid import.json", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  await host.getByTitle("Settings").click();
  const [download] = await Promise.all([
    ytPage.waitForEvent("download"),
    host.getByText("Export import.json").click(),
  ]);
  expect(download.suggestedFilename()).toBe(`import-${SEED_YOUTUBE_ID}.json`);

  const content = await (
    await download.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks).toString());
  const data = JSON.parse(content);
  expect(data).toMatchObject({
    video: {
      youtubeId: SEED_YOUTUBE_ID,
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
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
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

test("saved session keeps the track dropdowns while tracks load", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const { promise: release, resolve: releaseRequest } =
    Promise.withResolvers<void>();
  await context.route(
    "https://www.youtube.com/youtubei/v1/player",
    async (route) => {
      await release;
      await route.fallback();
    },
  );

  // The saved session shows while the player API request is held
  await ytPage.reload();
  await expect(host.locator("[data-index='0']")).toBeVisible();
  const selects = host.getByTestId("track-picker").locator("select");
  await expect(selects.nth(0)).toBeDisabled();
  await expect(selects.nth(0).locator("option:checked")).toHaveText(
    "Korean [ko]",
  );
  await expect(selects.nth(1).locator("option:checked")).toHaveText(
    "English [en]",
  );
  await expect(host.getByText("Korean · English")).toHaveCount(0);

  releaseRequest();
  await expect(selects.nth(0)).toBeEnabled();
  await expect(selects.nth(0).locator("option")).not.toHaveCount(2);
});

test("saved captions show when YouTube refuses the player API request", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await context.route("https://www.youtube.com/youtubei/v1/player", (route) =>
    route.fulfill({
      json: {
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you're not a bot",
        },
      },
    }),
  );

  // The session saved when the tracks were picked loads without YouTube
  await ytPage.reload();
  await expect(host.locator("[data-index='0']")).toBeVisible();
  await expect(host.getByTestId("tracks-error")).toContainText(
    "LOGIN_REQUIRED (Sign in to confirm you're not a bot)",
  );
  await expect(host.getByText("Korean · English")).toBeVisible();

  // A video with nothing saved has only the error to show
  await ytPage.goto(`https://www.youtube.com/watch?v=${OTHER_YOUTUBE_ID}`);
  await host.getByTestId("caption-fab").click();
  await expect(host.getByText("LOGIN_REQUIRED")).toBeVisible();
  await expect(host.locator("[data-index]")).toHaveCount(0);
});
