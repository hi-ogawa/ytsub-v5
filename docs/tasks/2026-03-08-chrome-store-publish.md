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
CI=true pnpm build-ext   # build with production name "Zamak"
pnpm zip-ext              # creates dist/extension.zip
```

Upload `dist/extension.zip` to Chrome Web Store Developer Dashboard.

## Chrome Web Store Submission Details

Use these when filling out the Developer Dashboard form:

### Extension Name

```
Zamak — YouTube Dual Subtitles
```

### Summary (132 char limit)

```
Watch YouTube with dual-language subtitles side by side. Click to seek, auto-scroll, resizable panel. For language learners.
```

### Description

```
Zamak adds a floating subtitle panel to YouTube that shows two languages side by side — perfect for language learners.

Features:
• Dual-language captions — see Korean + English (or any available pair) at the same time
• Click any caption line to seek the video to that timestamp
• Auto-scroll keeps the current caption visible as the video plays
• Resizable panel — drag to adjust width
• Floating action button to toggle the panel on/off
• Works with both manual and auto-generated YouTube subtitles
• No account required, no data collection — everything runs locally

How it works:
When you visit a YouTube video, Zamak fetches the available subtitle tracks and displays them in a side-by-side panel overlaid on the page. The panel syncs with video playback in real time.

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
- **Permissions**: None — content script match rule is sufficient, no `activeTab` or `storage` (uses `localStorage` directly)
- **Host permission justification** (for `https://www.youtube.com/*` content script match):
  ```
  The content script injects a dual-language subtitle panel into YouTube watch pages. It reads the video's existing subtitle tracks via YouTube's in-page player API and displays them side by side for language learners. The script only runs on youtube.com and does not access any other hosts.
  ```
- **Remote code**: No — all JS is bundled in the extension package, no external script tags, no eval(), no remote Wasm
- **Data use disclosures**: The extension implicitly transmits user behavior data (video ID, selected language) to YouTube's own timedtext API when fetching subtitles. It also stores track selection in localStorage. No data is sent to any third-party or external server. No PII, analytics, or tracking.
- **Privacy policy**: A minimal privacy policy stating the extension does not collect personal data is recommended. Per Chrome's [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), even extensions that don't handle sensitive data should explicitly state so.

#### Data use rationale

Chrome Web Store defines "user data" broadly as "information provided by a user or collected about a user or a user's use of the Product or Chrome Browser" ([Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)). "Handle" means "collecting, transmitting, using, or sharing user data" ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).

Zamak's data handling:

1. **Fetches subtitle XML** from YouTube's timedtext API — this transmits the video ID and user-selected language code to YouTube's server. While YouTube already knows the user is on this video, the extension is the one initiating additional requests, which constitutes "transmitting information about a user's use of the Product" under Chrome's definition.
2. **Stores track selection** in localStorage — user preference persistence, stays local, but still counts as handling user data (user's language choice)
3. **Does not transmit** any data to third-party or external servers — only to YouTube's own domain that the user is already on
4. **Does not collect** PII, browsing history, authentication info, or any of the sensitive categories listed in Chrome's [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy)

This data handling is **closely related to the extension's single stated purpose** (displaying dual subtitles), which per the [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements) means prominent in-product disclosure is not required — the store listing description already explains the functionality. However, a privacy policy explicitly stating what data is handled and that nothing goes to third parties is recommended per the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

### Additional Notes

- Host permission pattern: `https://www.youtube.com/*` (content script match)
- Content script runs in MAIN world to access YouTube's player APIs
- No background/service worker
- No remote code loading

## Future: Bookmark Sync with Server

Adding server integration (e.g. syncing bookmarks to the main Zamak app) would affect the Chrome Web Store listing:

- **New permissions needed**: `host_permissions` for the API domain (e.g. `https://zamak.example.com/*`), possibly `storage` for auth tokens
- **Privacy policy required**: mandatory once the extension transmits user data to a remote server
- **Privacy disclosures**: must declare what data is sent (bookmarks, video IDs) and where
- **Host permissions justification**: explain why the API domain is needed
- **Review impact**: remote server communication triggers closer review; first submission with remote permissions takes longer (days vs hours)
- **Recommended approach**: publish the current minimal version first (no permissions, fast approval), then add server integration in a later update — incremental permission additions are easier to get approved

## What's Remaining

- [x] Register Chrome Web Store developer account
- [x] Take screenshots for store listing
- [x] Upload zip and fill out listing
- [x] Submit for review (submitted 2026-03-08)
- [ ] Confirm approval and verify live listing
- [ ] (Optional) CI automation for publishing on tag/release
