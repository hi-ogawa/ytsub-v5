# YouTube Audio Download via Extension

## Problem

[youtube-dl-web-v2](~/code/personal/youtube-dl-web-v2) is a web app for downloading YouTube audio as OPUS files. It stopped working because YouTube added POT (Proof of Origin Token) requirements — the server-side proxy can no longer call the player API.

This extension already solves the same POT problem for captions via mobile client spoofing from the content script's MAIN world (same-origin). The player API response contains both caption tracks AND streaming format URLs (`streamingData.adaptiveFormats`). We currently discard the streaming data.

## Idea

Add audio download as a new extension page (`download.html`), reusing:

- **From ytsub-v5**: `fetchPlayerApi()` in content script (already bypasses POT) — just extract `streamingData` too
- **From youtube-dl-web-v2**: Client-side processing pipeline (chunked download → FFmpeg WASM → OPUS)

The extension eliminates youtube-dl-web-v2's entire server layer — all three proxy endpoints existed only for CORS, which the extension doesn't need.

## Reference: youtube-dl-web-v2 architecture

### What the server did (all eliminatable)

| Endpoint                | Purpose                             | Extension equivalent              |
| ----------------------- | ----------------------------------- | --------------------------------- |
| `/rpc getVideoMetadata` | Call player API (broken by POT)     | Content script `fetchPlayerApi()` |
| `/api/download`         | Proxy Range requests to YouTube CDN | Direct fetch (same-origin)        |
| `/api/proxy`            | CORS proxy for thumbnails           | Direct fetch (`i.ytimg.com`)      |

### Client pipeline (portable as-is)

```
1. fetchVideoInfo() → { formats: [{ url, filesize, itag, mimeType }] }
2. User picks audio format (WebM/Opus, sorted by size)
3. download() or downloadFastSeek() → ReadableStream<DownloadProgress>
   - Chunks file into 5MB Range requests
   - Fast-seek: parse WebM cues via libwebm WASM, fetch only trimmed range
4. webmToOpus(buffer, metadata) via FFmpeg WASM Worker
   - Embeds title/artist/album as Vorbis comments
   - Optionally embeds thumbnail (FLAC METADATA_BLOCK_PICTURE)
   - Optionally trims start/end
5. triggerDownloadClick() → browser save dialog
```

### Key source files in youtube-dl-web-v2

| File                                              | What to port                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/app/src/utils/youtube-utils.ts`         | `FormatInfo`, `VideoInfo` types, format parsing from `adaptiveFormats` |
| `packages/app/src/utils/download.ts`              | `download()`, `downloadFastSeek()` — chunked Range fetch               |
| `packages/app/src/utils/worker-client.ts`         | FFmpeg WASM worker setup (Comlink)                                     |
| `packages/app/src/utils/worker-client-libwebm.ts` | libwebm WASM worker + `findContainingRange`                            |
| `packages/app/src/worker/ffmpeg.ts`               | FFmpeg worker implementation                                           |
| `packages/app/src/worker/libwebm.ts`              | libwebm worker implementation                                          |
| `packages/app/src/routes/index.page.tsx`          | UI reference (format selector, metadata fields, progress)              |

### WASM binaries

- `@hiogawa/ffmpeg` workspace package — Emscripten-compiled FFmpeg (`ex00`) and libwebm (`ex01`)
- Two files each: `.js` module + `.wasm` binary
- Loaded via Comlink workers, initialized with `locateFile` for WASM URL
- For extension: ship in package, reference via `chrome.runtime.getURL()`

## Prototype plan

### Phase 1: Proof of concept — direct download (no WASM)

Goal: Verify that the extension can fetch streaming format URLs and download audio chunks directly.

1. **Extend `fetchPlayerApi()` to return streaming formats**
   - The player API response already has `streamingData.adaptiveFormats`
   - Add a new return type or separate function that extracts format info
   - Keep the existing caption extraction unchanged

2. **Add a download page** (`download.html`)
   - New Vite environment in `vite.ext.config.ts` (same pattern as `bookmarks`)
   - New entry: `src/extension/download.html` + `src/extension/download.tsx`
   - Simple UI: show current video's audio formats, pick one, download

3. **Implement direct chunked download**
   - Port `download()` from youtube-dl-web-v2
   - Replace `fetchDownload()` (proxy call) with direct `fetch(format.url, { headers: { range } })`
   - This is the key simplification — no proxy needed

4. **Wire up content script → download page**
   - Content script fetches player API, gets format URLs
   - User clicks download button → opens download page with video info
   - Download page fetches audio chunks directly from YouTube CDN

**Deliverable**: Raw WebM audio file downloaded via browser save dialog. No conversion, no metadata embedding yet.

### Phase 2: WASM processing

5. **Add FFmpeg WASM to extension**
   - Copy/reference `@hiogawa/ffmpeg` built binaries
   - Set up Comlink worker in extension context
   - WebM → OPUS conversion with metadata

6. **Add trimming support**
   - Port libwebm worker for fast-seek
   - Start/end time UI

### Phase 3: Polish

7. **Metadata editing** (title, artist, album)
8. **Thumbnail embedding**
9. **Consider: separate extension vs integrated**

## Open questions

- **WASM binary size**: How large are the FFmpeg/libwebm WASM files? Chrome Web Store has a 200MB limit but smaller is better. Could lazy-load from CDN instead of bundling.
- **Format URL lifetime**: Do the `adaptiveFormats` URLs expire? youtube-dl-web-v2's proxy re-fetched video info for each chunk (comment: "format url is throttled based on request's IP address"). In the extension we're same-origin, so this may not apply — needs testing.
- **Content script vs extension page**: The format URLs come from the content script (MAIN world). The download page is a separate `chrome-extension://` origin. How to pass the URLs? Options: chrome.storage, URL params, background message relay.
- **Can we skip WASM entirely for MVP?** YouTube serves Opus-in-WebM. Some players handle `.webm` directly. If users just want the audio file, raw download might be enough.

## Status

- [x] Research complete
- [ ] Waiting for feedback on approach
