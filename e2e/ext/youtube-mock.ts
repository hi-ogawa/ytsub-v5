import { readFileSync } from "node:fs";
import type { BrowserContext, Route } from "@playwright/test";
import type { YouTubeExtractionResult } from "../../src/lib/youtube.ts";

const FIXTURE_DIR = "scripts/youtube-json";

/**
 * Serve youtube.com from `scripts/youtube-json` fixtures. The watch page
 * carries only what the content script reads: `ytcfg` and a `<video>`.
 * Changes to the real page or API shape are covered by `pnpm test-youtube`.
 */
export async function mockYouTube(context: BrowserContext) {
  await context.route("https://www.youtube.com/**", async (route) => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case "/watch": {
        await route.fulfill({ contentType: "text/html", body: WATCH_HTML });
        return;
      }
      case "/youtubei/v1/player": {
        const { videoId } = route.request().postDataJSON();
        await fulfillPlayer(route, videoId);
        return;
      }
      case "/api/timedtext": {
        await route.fulfill({
          path: `${FIXTURE_DIR}/${url.searchParams.get("v")}/track-${url.searchParams.get("vssId")}.json`,
        });
        return;
      }
      default: {
        await route.abort();
      }
    }
  });
}

const WATCH_HTML = `<!doctype html>
<html>
  <head>
    <script>window.ytcfg = { data_: { VISITOR_DATA: "e2e-visitor" } };</script>
  </head>
  <body>
    <video></video>
  </body>
</html>
`;

async function fulfillPlayer(route: Route, videoId: string) {
  const metadata: YouTubeExtractionResult = JSON.parse(
    readFileSync(`${FIXTURE_DIR}/${videoId}/metadata.json`, "utf-8"),
  );
  const { video, captionTracks } = metadata;
  await route.fulfill({
    json: {
      videoDetails: {
        videoId: video.youtubeId,
        title: video.title,
        author: video.channelName,
        channelId: video.channelId,
        lengthSeconds: String(video.duration),
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: captionTracks.map((track) => ({
            baseUrl: `https://www.youtube.com/api/timedtext?${new URLSearchParams({ v: videoId, vssId: track.vssId })}`,
            languageCode: track.languageCode,
            kind: track.kind,
            name: { simpleText: track.name },
            vssId: track.vssId,
          })),
        },
      },
    },
  });
}
