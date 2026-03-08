import { test, expect } from "@playwright/test";
import {
  extractVideoData,
  fetchPlayerApi,
  fetchTrackJson3,
  parseJson3,
  pickBestTrack,
} from "../src/lib/youtube";

// Billlie - cloud palace (known to have ko + en manual subs)
const TEST_VIDEO_ID = "7GU_VQfgMT0";

test("extractVideoData: metadata + pick tracks", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(extractVideoData);

  expect(result.video).toEqual({
    youtubeId: TEST_VIDEO_ID,
    title: "Billlie | 'cloud palace' 𝐁efore sunrise live",
    channelName: "Billlie",
    channelId: "UCyc9sUCxELTDK9vELO5Fzeg",
    duration: 210,
  });

  const track1 = pickBestTrack(result.captionTracks, "ko");
  const track2 = pickBestTrack(result.captionTracks, "en");
  expect(track1).toEqual(
    expect.objectContaining({ languageCode: "ko", kind: undefined }),
  );
  expect(track2).toEqual(
    expect.objectContaining({ languageCode: "en", kind: undefined }),
  );
});

test("fetchPlayerApi: metadata + fetch & parse both tracks", async ({
  page,
}) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const result = await page.evaluate(fetchPlayerApi, TEST_VIDEO_ID);

  expect(result.video).toEqual({
    youtubeId: TEST_VIDEO_ID,
    title: "Billlie | 'cloud palace' 𝐁efore sunrise live",
    channelName: "Billlie",
    channelId: "UCyc9sUCxELTDK9vELO5Fzeg",
    duration: 210,
  });

  const track1 = pickBestTrack(result.captionTracks, "ko");
  const track2 = pickBestTrack(result.captionTracks, "en");
  expect(track1).toEqual(
    expect.objectContaining({ languageCode: "ko", kind: undefined }),
  );
  expect(track2).toEqual(
    expect.objectContaining({ languageCode: "en", kind: undefined }),
  );

  const [json3Ko, json3En] = await Promise.all([
    page.evaluate(fetchTrackJson3, track1!.baseUrl),
    page.evaluate(fetchTrackJson3, track2!.baseUrl),
  ]);

  const cuesKo = parseJson3(json3Ko);
  const cuesEn = parseJson3(json3En);

  expect(cuesKo.length).toBeGreaterThan(0);
  expect(cuesEn.length).toBeGreaterThan(0);
});
