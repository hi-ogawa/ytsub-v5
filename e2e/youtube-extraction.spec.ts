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

test("player API: fetch metadata + json3", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(fetchPlayerApi, TEST_VIDEO_ID);

  expect(result.video.youtubeId).toBe(TEST_VIDEO_ID);
  expect(result.video.title).toBeTruthy();
  expect(result.captionTracks.length).toBeGreaterThan(0);

  const { track1 } = pickTracks(result.captionTracks);
  expect(track1).toBeDefined();
  expect(track1!.languageCode).toBe("ko");

  // Fetch and parse json3 for ko track
  const json3 = await page.evaluate(fetchTrackJson3, track1!.baseUrl);
  expect(json3.events.length).toBeGreaterThan(0);

  const cues = parseJson3(json3);
  expect(cues.length).toBeGreaterThan(0);
});

test("fetch both tracks and parse", async ({ page }) => {
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
});
