import { readFileSync } from "node:fs";
import type { BrowserContext, Route } from "@playwright/test";
import type { YouTubeExtractionResult } from "../../src/lib/youtube.ts";

const FIXTURE_DIR = "scripts/youtube-json";

/**
 * Serve youtube.com from `scripts/youtube-json` fixtures. The watch page
 * carries only what the content script reads: `ytcfg` and a `<video>`.
 * Changes to the real page or API shape are covered by `pnpm test-youtube`.
 *
 * A status line under the video mirrors its play state and current time, so
 * trace snapshots show what the player did between assertions.
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
        const { videoId: youtubeId } = route.request().postDataJSON();
        await fulfillPlayer(route, youtubeId);
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
    <style>
      body { margin: 0; font-family: sans-serif; color: #888; }
      header { height: 56px; border-bottom: 1px dashed #ccc; padding: 0 24px; line-height: 56px; }
      main { padding: 24px; width: 60%; }
      video { display: block; width: 100%; aspect-ratio: 16 / 9; background: #ddd; }
      .line { height: 16px; margin-top: 12px; background: #eee; }
      #playback { display: block; margin-top: 8px; font-family: monospace; color: #444; }
    </style>
  </head>
  <body>
    <header>Mock YouTube (e2e/ext/youtube-mock.ts)</header>
    <main>
      <video></video>
      <output id="playback"></output>
      <div class="line" style="width: 70%"></div>
      <div class="line" style="width: 40%"></div>
    </main>
    <script>
      // A source-less video fires no seeked or timeupdate events, so poll it.
      {
        const video = document.querySelector("video");
        const status = document.getElementById("playback");
        (function render() {
          const text = \`\${video.paused ? "paused" : "playing"} at \${video.currentTime.toFixed(2)}s\`;
          if (status.textContent !== text) status.textContent = text;
          requestAnimationFrame(render);
        })();
      }
    </script>
  </body>
</html>
`;

async function fulfillPlayer(route: Route, youtubeId: string) {
  const metadata: YouTubeExtractionResult = JSON.parse(
    readFileSync(`${FIXTURE_DIR}/${youtubeId}/metadata.json`, "utf-8"),
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
            baseUrl: `https://www.youtube.com/api/timedtext?${new URLSearchParams({ v: youtubeId, vssId: track.vssId })}`,
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
