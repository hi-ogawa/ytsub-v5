# Split yt-dlp-ext into standalone project

## Problem

The youtube-dl prototype lives inside ytsub-v5 (Zamak). It's verified working but shares infrastructure (RPC, content script, background worker, build config) with the subtitle extension. Need to extract it to `~/code/personal/yt-dlp-ext` as a standalone Chrome extension.

## What to extract

### Files to copy and adapt

| Source (ytsub-v5)                           | Purpose in new project                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/extension/download.tsx`                | Main UI — becomes the popup/page, mostly as-is                                                                          |
| `src/extension/download.html`               | Entry point HTML                                                                                                        |
| `src/extension/content.tsx` (lines 38-88)   | `getStreamingFormats` + `downloadFormat` tab RPC handlers only                                                          |
| `src/extension/background.ts` (lines 33-45) | `openDownload`, `getDownloadData`, `downloadFormat` handlers                                                            |
| `src/extension/relay.ts`                    | BroadcastChannel relay — copy as-is                                                                                     |
| `src/extension/lib/extension-rpc.ts`        | Full RPC framework — copy as-is                                                                                         |
| `src/extension/lib/content-ports.ts`        | Content port tracker — copy as-is                                                                                       |
| `src/lib/youtube.ts`                        | `fetchPlayerApi` + streaming format types. Strip caption/subtitle logic — only need player API call + format extraction |
| `src/lib/theme.ts`                          | Theme toggle — copy as-is (small, standalone)                                                                           |
| `src/styles.css`                            | Tailwind base styles                                                                                                    |

### What NOT to copy

- Caption panel, bookmarks, video viewer, sync, IDB session storage
- Server/Cloudflare worker, oRPC, drizzle
- Web app routes, Playwright e2e infra
- `tabRpcHandlers.getSession` / `saveSession` (subtitle-specific)

## New project structure

```
~/code/personal/yt-dlp-ext/
├── CLAUDE.md                      # Points to @AGENTS.md
├── AGENTS.md                      # Quick reference, conventions, agent rules
├── docs/
│   └── prd.md                     # Product doc
├── src/
│   ├── background.ts              # Service worker (minimal — open page on click)
│   ├── content.ts                 # MAIN world, all_frames: true — player API + chunked download
│   ├── index.html                 # Extension page entry
│   ├── index.tsx                  # Download UI (React) — embeds YouTube iframe
│   ├── styles.css                 # Tailwind base
│   ├── lib/
│   │   ├── youtube.ts             # fetchPlayerApi + format types
│   │   └── theme.ts               # Theme toggle
│   └── public/
│       └── manifest.json          # MV3 manifest
├── e2e/
│   ├── helper.ts                  # Playwright extension test fixtures
│   └── smoke.spec.ts              # Smoke test
├── scripts/
│   └── dev.ts                     # node --watch rebuild wrapper
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Multi-environment extension build
└── playwright.config.ts
```

## Implementation steps

### 1. Scaffold project

- `mkdir ~/code/personal/yt-dlp-ext && cd $_`
- `git init`
- `package.json` with minimal deps: `react`, `react-dom`, `sonner`, `tailwindcss`, `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite`, `typescript`, `@types/react`, `@types/react-dom`, `@types/chrome`
  - Drop: `@orpc/*`, `@tanstack/react-query`, `drizzle-orm`, `lucide-react`, `radix-ui`, `react-router`, `zod`, `@cloudflare/*`, `wrangler`, `playwright`, `knip`, `vite-plus`, `sharp`
- `tsconfig.json` — same compiler options minus `@cloudflare/workers-types`
- `pnpm install`

### 2. Copy and strip source files

- **`src/lib/youtube.ts`**: Copy the full file, then strip:
  - Keep: `YouTubeVideoData`, `YouTubeStreamingFormat`, `YouTubeExtractionResult` (but maybe rename), `fetchPlayerApi`
  - Remove: `YouTubeCaptionTrack`, `Json3Event`, `Json3File`, `fetchTrackJson3`, caption parsing, subtitle-related code
  - `fetchPlayerApi` still needs to call YouTube's player API to get `streamingData.adaptiveFormats` — keep that path, drop caption track extraction or make it optional
- **`src/extension/lib/extension-rpc.ts`**: Copy as-is (self-contained, no external deps)
- **`src/extension/lib/content-ports.ts`**: Copy as-is
- **`src/extension/relay.ts`**: Copy, remove video-index localStorage sync (lines 27-35) — just keep RPC relay + tab RPC relay + `connectContentPort()`
- **`src/extension/content.ts`**: New file with only download handlers:
  - `getStreamingFormats` and `downloadFormat` from current `tabRpcHandlers`
  - `registerTabRpcHandlers(handlers)` call
  - No React, no shadow DOM, no caption panel
- **`src/extension/background.ts`**: New file with only:
  - `openDownload`, `getDownloadData`, `downloadFormat` handlers
  - `createContentPortTracker()` + `registerRpcHandlers()`
  - No oRPC, no server URL, no sync, no session token
- **`src/extension/download.tsx`**: Copy as-is (already self-contained for download)
- **`src/extension/download.html`**: Copy as-is
- **`src/lib/theme.ts`**: Copy as-is (no external deps beyond React + lucide)
  - Actually uses `lucide-react` for icons — either keep the dep or simplify to inline SVG
- **`src/styles.css`**: Copy Tailwind config (may need to trim theme tokens to only what download page uses)

### 3. Build config

Single `vite.config.ts` with multi-environment build (same pattern as ytsub-v5's `vite.ext.config.ts` but without bookmarks):

- `client` env → `content.ts` (IIFE)
- `download` env → `download.html` (standard)
- `background` env → `background.ts` (IIFE)
- `relay` env → `relay.ts` (IIFE)

Scripts:

- `pnpm build` → `vite build`
- `pnpm dev` → watch mode with `DEV_EXT` flag (or just `vite build --watch`)

### 4. Manifest

```json
{
  "manifest_version": 3,
  "name": "yt-dlp-ext",
  "version": "0.1.0",
  "description": "Download YouTube audio directly from the browser",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {},
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "world": "MAIN",
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["relay.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### 5. Verify

- `pnpm build` succeeds
- `tsc` passes
- Load unpacked in Chrome, navigate to YouTube, open download page, test a download

## Decisions to confirm

1. **lucide-react**: The theme toggle uses lucide icons. Options: (a) keep the dep, (b) drop theme toggle for now (download page doesn't need cycle button), (c) inline SVG. Recommend (b) — the download page only calls `useTheme()` for dark mode class application, doesn't render the cycle button. Can simplify to just auto-detect system theme.

2. **Project name**: `yt-dlp-ext` — fine? Or something else?

3. **RPC channel names**: Currently `"zamak:rpc"` / `"zamak:tab-rpc"`. Should rename to avoid collision if both extensions are loaded simultaneously. Suggest `"ytdl:rpc"` / `"ytdl:tab-rpc"`.

4. **youtube.ts stripping**: `fetchPlayerApi` is a ~200 line function that does mobile client spoofing. It also extracts captions. Options: (a) copy full function, just don't use caption output, (b) strip caption extraction. Recommend (a) for now — less divergence, can trim later.

## Feedback (2026-03-25)

- Use `index.html` instead of `download.html`
- Keep UI deps (`@tanstack/react-query`, `radix-ui`, `lucide-react`, `sonner`) — preserve the same UI patterns and principles
- Keep Playwright for extension e2e testing
- **Architecture change: iframe trick instead of relay/tab RPC** (see below)

### Iframe approach

Reference: `docs/tasks/2026-03-15-extension-idb-cross-origin-bug.md` — "Alternative considered: YouTube embed iframe inside extension page"

That doc concluded the iframe trick **doesn't solve IDB** (storage partitioning keys iframe IDB by top-level origin). But yt-dlp-ext **doesn't need IDB** — it only needs:

1. Same-origin `fetch()` to YouTube's player API (bypass POT via mobile client spoofing)
2. Same-origin `fetch()` with Range headers to YouTube CDN (chunked download)

Both work from a content script injected into a `youtube.com/embed/` iframe inside the extension page. The `/embed/` endpoint allows framing (no `X-Frame-Options` block). This was verified in ytsub-v4 (`src/entrypoints/caption-editor/main.tsx`).

**This eliminates:**

- `relay.ts` (BroadcastChannel relay between MAIN/ISOLATED worlds)
- `content-ports.ts` (tab tracking)
- The entire reverse/tab RPC mechanism
- The requirement to have a YouTube tab open

**New architecture:**

```
Extension page (index.html)
  └── <iframe src="https://www.youtube.com/embed/">
        └── content script (MAIN world, all_frames: true)
              ├── fetchPlayerApi() — same-origin, POT bypass works
              └── chunked fetch() to CDN — same-origin Range requests

Communication: postMessage between extension page ↔ iframe content script
```

The background service worker becomes minimal — just opens the extension page on action click.

### Revised file list

| File                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `src/index.html`           | Extension page entry                                           |
| `src/index.tsx`            | Download UI (React) — embeds YouTube iframe, postMessage RPC   |
| `src/content.ts`           | MAIN world, `all_frames: true` — player API + chunked download |
| `src/background.ts`        | Minimal: open index.html on action click                       |
| `src/public/manifest.json` | `all_frames: true` for content script                          |
| `src/lib/youtube.ts`       | `fetchPlayerApi` + format types                                |
| `src/lib/theme.ts`         | Theme toggle                                                   |
| `src/styles.css`           | Tailwind base                                                  |
| `e2e/`                     | Playwright extension e2e tests                                 |

**Dropped** (no longer needed): `relay.ts`, `extension-rpc.ts`, `content-ports.ts`

### Revised manifest

```json
{
  "manifest_version": 3,
  "name": "yt-dlp-ext",
  "version": "0.1.0",
  "description": "Download YouTube audio directly from the browser",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {},
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "world": "MAIN",
      "all_frames": true,
      "run_at": "document_idle"
    }
  ]
}
```

### Content script ↔ extension page communication

Use `window.postMessage` / `message` event:

- Extension page sends `{ type: "ytdl-request", id, method, params }` to iframe via `iframe.contentWindow.postMessage(..., "https://www.youtube.com")`
- Content script (MAIN world in iframe) listens on `window.addEventListener("message", ...)`, executes handler, responds with `window.parent.postMessage({ type: "ytdl-response", id, result/error }, "*")`
- Simple promise-based RPC wrapper on the extension page side

### Open question

- **Blob download from iframe**: The content script currently creates a blob URL and triggers `<a>.click()`. From inside the iframe, this download may be attributed to youtube.com or may be blocked by the iframe sandbox. Alternative: transfer the downloaded `Uint8Array` back to the extension page via `postMessage` (transferable), create the blob there. Need to test which approach works. `postMessage` with transferable `ArrayBuffer` is zero-copy so no performance concern.

## Feedback (2026-03-25 #2)

- Repo `~/code/personal/yt-dlp-ext` with git already exists — skip mkdir/git init
- Add meta docs: `CLAUDE.md`, `AGENTS.md`, `docs/prd.md`
- Flatten `src/extension/` to `src/` directly (no `extension/` subdirectory)
- Scripts: `dev` (not `dev-ext`), `build` (not `build-ext`), `test-e2e` (not `test-e2e-ext`)

## Feedback (2026-03-25 #3)

- Merge ytsub-v5's `vite.config.ts` (vite-plus: fmt, staged, test) and `vite.ext.config.ts` (extension build) into single `vite.config.ts`
- Keep `vite-plus` + `knip` for formatting/linting tooling
- Keep scripts: `prepare` (vp config), `lint` (vp fmt && knip --fix), `lint-check` (vp fmt --check && knip)

## Implementation plan

### Step 1: Project setup / infra / tooling

Goal: empty extension that builds, type-checks, loads in Chrome, and has Playwright e2e wired up — no download logic yet.

**1a. Meta docs**

- `CLAUDE.md` — points to `@AGENTS.md`
- `AGENTS.md` — quick reference (commands, conventions, agent rules), adapted from ytsub-v5 but simplified for extension-only project
- `docs/prd.md` — brief product doc: what yt-dlp-ext does, current status, future work (WASM phase etc.)

**1b. Package + install**

- `package.json` — deps:
  - runtime: `react`, `react-dom`, `sonner`, `@tanstack/react-query`, `radix-ui`, `lucide-react`
  - dev: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`, `@types/chrome`, `@types/node`, `@playwright/test`, `vite-plus`, `knip`
  - scripts:
    - `prepare` — `vp config`
    - `build` — `vite build && cd dist && zip -r ../dist.zip .`
    - `dev` — `node --watch --watch-path=./src scripts/dev.ts`
    - `tsc` — `tsc -b`
    - `lint` — `vp fmt && knip --fix`
    - `lint-check` — `vp fmt --check && knip`
    - `test-e2e` — `playwright test`
- `pnpm install`

**1c. TypeScript config**

- `tsconfig.json` — same compiler options as ytsub-v5 minus `@cloudflare/workers-types`. Types: `["vite/client", "@types/chrome"]`

**1d. Vite config (merged)**

- Single `vite.config.ts` combining:
  - **vite-plus config** (from ytsub-v5's `vite.config.ts`): `fmt` (printWidth, sortImports, sortPackageJson), `staged` ("\*": "vp fmt")
  - **Extension build** (from ytsub-v5's `vite.ext.config.ts`): multi-environment build
    - `client` → `src/content.ts` (IIFE)
    - `page` → `src/index.html` (standard)
    - `background` → `src/background.ts` (IIFE)
    - `buildApp` → copy HTML, copy `src/public/*`, modify manifest for dev
  - `define`: `__BUILD_TIME__`, `__GIT_REV__`
  - `plugins`: `[react(), tailwindcss()]`

**1e. Manifest + stub source files**

- `src/public/manifest.json` — MV3 manifest with `all_frames: true` content script
- `src/background.ts` — stub: opens `index.html` on action click
- `src/content.ts` — stub: `console.log("[yt-dlp-ext] content script loaded")`
- `src/index.html` — minimal HTML shell
- `src/index.tsx` — minimal React app rendering "yt-dlp-ext" placeholder, with theme
- `src/styles.css` — Tailwind base (copy from ytsub-v5, trim to essentials)
- `src/lib/theme.ts` — copy from ytsub-v5

**1f. Playwright extension e2e**

- `playwright.config.ts` — single project, no web server needed
- `e2e/helper.ts` — `test` fixture that launches Chromium with `--load-extension`, provides `context`, `extensionId`, `page`
- `e2e/smoke.spec.ts` — smoke test: opens extension page, asserts placeholder text renders

**1g. Dev workflow**

- `scripts/dev.ts` — `node --watch` wrapper (same pattern as ytsub-v5's `dev-ext`)
- Verify: `pnpm build` passes, `pnpm tsc` passes, `pnpm lint` passes, load unpacked in Chrome shows the placeholder page, `pnpm test-e2e` passes

### Step 2: Port download feature with iframe architecture

Goal: working audio download — search video, pick format, download file.

- Port `fetchPlayerApi` + format types from ytsub-v5's `src/lib/youtube.ts`
- Implement `content.ts`: postMessage RPC handler in MAIN world — `getStreamingFormats`, `downloadFormat`
- Implement `index.tsx`: download UI with embedded YouTube embed iframe, postMessage RPC client
- Wire up end-to-end: search → iframe fetches formats → display → download → transfer bytes → blob save
- E2e tests for download page UI
- Manual verification

Detailed breakdown deferred to when we start step 2.

## Status

- [ ] Implementation plan written, waiting for approval
