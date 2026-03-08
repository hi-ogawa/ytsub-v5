import { test, expect } from "@playwright/test";
import {
  extractVideoData,
  fetchPlayerApi,
  fetchTrackJson3,
  parseJson3,
  pickTracks,
} from "../src/lib/youtube";

// Billlie - cloud palace (known to have ko + en manual subs)
const TEST_VIDEO_ID = "7GU_VQfgMT0";

test("extract video metadata from ytInitialPlayerResponse", async ({
  page,
}) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(extractVideoData);

  expect(result.video.youtubeId).toBe(TEST_VIDEO_ID);
  expect(result.video.title).toBeTruthy();
  expect(result.video.channelName).toBeTruthy();
  expect(result.video.channelId).toBeTruthy();
  expect(result.video.duration).toBeGreaterThan(0);
  expect(result.captionTracks.length).toBeGreaterThan(0);

  for (const track of result.captionTracks) {
    expect(track.baseUrl).toBeTruthy();
    expect(track.languageCode).toBeTruthy();
    expect(track.vssId).toBeTruthy();
  }
});

test("pick ko + en tracks from extraction result", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(extractVideoData);
  const { track1, track2 } = pickTracks(result.captionTracks);

  expect(track1).toBeDefined();
  expect(track1!.languageCode).toBe("ko");
  expect(track2).toBeDefined();
  expect(track2!.languageCode).toBe("en");
});

test("fetch metadata via player API (iOS client)", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(fetchPlayerApi, TEST_VIDEO_ID);

  expect(result.video.youtubeId).toBe(TEST_VIDEO_ID);
  expect(result.video.title).toBeTruthy();
  expect(result.captionTracks.length).toBeGreaterThan(0);

  const { track1 } = pickTracks(result.captionTracks);
  expect(track1).toBeDefined();
  expect(track1!.languageCode).toBe("ko");

  console.log("player API track1 baseUrl:", track1!.baseUrl);
  console.log(
    "player API tracks:",
    result.captionTracks.map(
      (t) => `${t.languageCode} (${t.kind ?? "manual"})`,
    ),
  );
});

test("fetch json3 via player API baseUrl", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(fetchPlayerApi, TEST_VIDEO_ID);
  const { track1 } = pickTracks(result.captionTracks);
  expect(track1).toBeDefined();

  // Fetch json3 using the player API's baseUrl (may bypass POT)
  const json3 = await page.evaluate(fetchTrackJson3, track1!.baseUrl);
  expect(json3.events).toBeDefined();
  expect(json3.events.length).toBeGreaterThan(0);

  const cues = parseJson3(json3);
  expect(cues.length).toBeGreaterThan(0);
  console.log(`ko: ${cues.length} cues, sample:`, cues[0]);

  // Verify cue structure
  for (const cue of cues) {
    expect(cue.begin).toBeGreaterThanOrEqual(0);
    expect(cue.end).toBeGreaterThan(cue.begin);
    expect(cue.text).toBeTruthy();
  }
});

test("fetch both tracks via player API and parse", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(fetchPlayerApi, TEST_VIDEO_ID);
  const { track1, track2 } = pickTracks(result.captionTracks);
  expect(track1).toBeDefined();
  expect(track2).toBeDefined();

  const [json3Ko, json3En] = await Promise.all([
    page.evaluate(fetchTrackJson3, track1!.baseUrl),
    page.evaluate(fetchTrackJson3, track2!.baseUrl),
  ]);

  const cuesKo = parseJson3(json3Ko);
  const cuesEn = parseJson3(json3En);

  expect(cuesKo.length).toBeGreaterThan(0);
  expect(cuesEn.length).toBeGreaterThan(0);

  console.log(`ko: ${cuesKo.length} cues, en: ${cuesEn.length} cues`);
  console.log(`ko sample:`, cuesKo[0]);
  console.log(`en sample:`, cuesEn[0]);
});
