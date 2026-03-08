# Publish Extension to Chrome Web Store

## Problem

The extension works locally via "Load unpacked" but isn't published to the Chrome Web Store yet. The `release chrome store` item in `docs/prd.md` tracks this.

## What's Done

- Extension icons created (16, 48, 128px PNG) in `src/extension/icons/`
- Manifest updated with icons and descriptive text
- Build config (`vite.ext.config.ts`) copies icons to `dist/extension/icons/`
- `pnpm zip-ext` script packages `dist/extension/` into `dist/extension.zip`
- Icon generation script at `scripts/generate-icons.ts` (requires `sharp` — install with `pnpm add -D sharp` if regenerating)

## Build & Package

```sh
CI=true pnpm build-ext   # build with production name "ytsub"
pnpm zip-ext              # creates dist/extension.zip
```

Upload `dist/extension.zip` to Chrome Web Store Developer Dashboard.

## Chrome Web Store Submission Details

Use these when filling out the Developer Dashboard form:

### Extension Name

```
ytsub — YouTube Dual Subtitles
```

### Summary (132 char limit)

```
Watch YouTube with dual-language subtitles side by side. Click to seek, auto-scroll, resizable panel. For language learners.
```

### Description

```
ytsub adds a floating subtitle panel to YouTube that shows two languages side by side — perfect for language learners.

Features:
• Dual-language captions — see Korean + English (or any available pair) at the same time
• Click any caption line to seek the video to that timestamp
• Auto-scroll keeps the current caption visible as the video plays
• Resizable panel — drag to adjust width
• Floating action button to toggle the panel on/off
• Works with both manual and auto-generated YouTube subtitles
• No account required, no data collection — everything runs locally

How it works:
When you visit a YouTube video, ytsub fetches the available subtitle tracks and displays them in a side-by-side panel overlaid on the page. The panel syncs with video playback in real time.

Supported: Any YouTube video with subtitles in two or more languages.
```

### Category

```
Education
```

### Language

```
English
```

### Screenshots

Take screenshots at 1280×800 showing:

1. The extension panel open on a YouTube video with dual subtitles visible
2. Close-up of the caption panel showing two language columns

### Privacy

- **Single purpose description**: "Display dual-language subtitles on YouTube videos for language learning"
- **Permissions justification**:
  - `activeTab`: Access the current YouTube tab to read video metadata and subtitle data
  - `storage`: Remember user preferences (panel width, open/closed state)
- **Data use disclosures**: No data collected, no data shared, no analytics, no remote servers contacted (except YouTube's own subtitle API from within the YouTube page)
- **Privacy policy**: Not required for extensions that don't collect user data

### Additional Notes

- Host permission pattern: `https://www.youtube.com/*` (content script match)
- Content script runs in MAIN world to access YouTube's player APIs
- No background/service worker
- No remote code loading

## What's Remaining

- [ ] Register Chrome Web Store developer account ($5 one-time fee)
- [ ] Take screenshots for store listing
- [ ] Upload zip and fill out listing using details above
- [ ] Submit for review (typically 1-3 business days)
- [ ] (Optional) CI automation for publishing on tag/release
