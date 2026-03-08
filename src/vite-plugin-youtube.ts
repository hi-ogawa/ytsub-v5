import type { Plugin } from "vite";
import {
  type YouTubeExtractionResult,
  fetchPlayerApi,
  fetchTrackJson3,
} from "./lib/youtube";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Vite plugin that provides dev-only endpoints for YouTube subtitle extraction.
 * Uses headless Playwright to run in YouTube page context (same-origin, bypasses CORS + POT).
 *
 * Endpoints:
 *   GET /api/dev/youtube/:videoId        — video metadata + caption track list
 *   GET /api/dev/youtube/track?url=...   — fetch json3 for a track baseUrl
 */
export function youtubeDevPlugin(): Plugin {
  let browserPromise: ReturnType<typeof launchBrowser> | null = null;
  const cache = new Map<
    string,
    { result: YouTubeExtractionResult; expires: number }
  >();

  async function launchBrowser() {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    const context = await browser.newContext();
    return { browser, context };
  }

  function getBrowser() {
    if (!browserPromise) {
      browserPromise = launchBrowser();
    }
    return browserPromise;
  }

  async function getPage() {
    const { context } = await getBrowser();
    return context.newPage();
  }

  return {
    name: "youtube-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);

        // GET /api/dev/youtube/track?url=... — fetch json3
        if (url.pathname === "/api/dev/youtube/track") {
          const trackUrl = url.searchParams.get("url");
          if (!trackUrl) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "missing ?url= parameter" }));
            return;
          }

          res.setHeader("Content-Type", "application/json");
          try {
            const page = await getPage();
            try {
              // Navigate to YouTube first for same-origin context
              await page.goto("https://www.youtube.com", {
                waitUntil: "domcontentloaded",
              });
              const json3 = await page.evaluate(fetchTrackJson3, trackUrl);
              res.end(JSON.stringify(json3));
            } finally {
              await page.close();
            }
          } catch (err) {
            console.error("[youtube-dev] track fetch error:", err);
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
          return;
        }

        // GET /api/dev/youtube/:videoId — metadata + tracks
        const match = url.pathname.match(
          /^\/api\/dev\/youtube\/([a-zA-Z0-9_-]+)$/,
        );
        if (!match) return next();

        const videoId = match[1];
        res.setHeader("Content-Type", "application/json");

        // Check cache
        const cached = cache.get(videoId);
        if (cached && cached.expires > Date.now()) {
          res.end(JSON.stringify(cached.result));
          return;
        }

        try {
          const page = await getPage();
          try {
            await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
              waitUntil: "domcontentloaded",
            });
            const result = await page.evaluate(fetchPlayerApi, videoId);
            cache.set(videoId, {
              result,
              expires: Date.now() + CACHE_TTL_MS,
            });
            res.end(JSON.stringify(result));
          } finally {
            await page.close();
          }
        } catch (err) {
          console.error("[youtube-dev]", err);
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      });
    },
    async buildEnd() {
      if (browserPromise) {
        const { browser } = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    },
  };
}
