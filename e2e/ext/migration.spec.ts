import { expect } from "@playwright/test";
import { gotoBookmarks, seedChromeStorage, test } from "./helper";

// Billlie - cloud palace
const SEED_VIDEO_ID = "7GU_VQfgMT0";

const legacyEntry = {
  youtubeId: SEED_VIDEO_ID,
  title: "cloud palace",
  channelName: "Billlie",
  bookmarkCount: 1,
  updatedAt: "2026-03-15T00:00:00.000Z",
};

const legacySession = {
  youtubeId: SEED_VIDEO_ID,
  title: "cloud palace",
  channelName: "Billlie",
  channelId: "",
  duration: 0,
  vssId1: ".ko",
  vssId2: ".en",
  language1: "ko",
  language2: "en",
  captions: [
    {
      idx: 0,
      begin: 0,
      end: 1000,
      text1: "구름 궁전",
      text2: "cloud palace",
      cue1Indices: [0],
      cue2Indices: [0],
      text1Segments: ["구름 궁전"],
      text2Segments: ["cloud palace"],
    },
  ],
  bookmarks: [
    {
      id: "legacy-bookmark",
      text: "구름",
      side: 0,
      offset: 0,
      captionIndex: 0,
      timestamp: 0,
      context: "구름 궁전",
      createdAt: "2026-03-15T00:00:00.000Z",
    },
  ],
};

test("migration: a watch page moves youtube.com data into extension storage", async ({
  context,
  page,
  extensionId,
}) => {
  // Storage as the previous version left it
  await seedChromeStorage(context, { "zamak:video-index": [legacyEntry] });
  const ytPage = await context.newPage();
  await ytPage.goto("https://www.youtube.com/");
  await ytPage.evaluate(
    async ({ entry, session }) => {
      localStorage.setItem("zamak:video-index", JSON.stringify([entry]));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("zamak", 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore("caption-sessions", {
            keyPath: "youtubeId",
          });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("caption-sessions", "readwrite");
        tx.objectStore("caption-sessions").put(session);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { entry: legacyEntry, session: legacySession },
  );

  await gotoBookmarks(page, extensionId);
  const notice = page.getByTestId("migration-notice");
  const card = page.getByTestId(`video-card-${SEED_VIDEO_ID}`);
  await expect(notice).toBeVisible();
  await expect(card).toHaveCount(0);

  // Loading a watch page copies the data, and the open bookmarks page hears it
  await ytPage.goto(`https://www.youtube.com/watch?v=${SEED_VIDEO_ID}`);
  await expect(card.getByTestId("video-card-badge")).toHaveText("1 bookmark");
  await expect(notice).toHaveCount(0);

  const host = ytPage.locator("#zamak-host");
  await host.getByTestId("caption-fab").click();
  await expect(
    host.getByRole("button", { name: "Bookmarks (1)" }),
  ).toBeVisible();
});
