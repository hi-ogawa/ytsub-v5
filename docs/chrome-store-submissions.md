# Chrome Web Store Submission Details

Full listing details for the next Chrome Web Store submission. Copy-paste into the Developer Dashboard.

## Build & Package

```sh
npm build-ext   # build with production name "Zamak"
```

Upload `dist/extension.zip` to Chrome Web Store Developer Dashboard.

## Extension Name

```
Zamak — YouTube Dual Subtitles
```

## Version

```
0.2.0
```

## Summary (132 char limit)

```
Watch YouTube with dual-language subtitles side by side. Bookmark captions, view all bookmarks. For language learners.
```

## Description

```
Zamak adds a floating subtitle panel to YouTube that shows two languages side by side — perfect for language learners.

Features:
• Dual-language captions — see Korean + English (or any available pair) at the same time
• Click any caption line to seek the video to that timestamp
• Auto-scroll keeps the current caption visible as the video plays
• Resizable panel — drag to adjust width
• Floating action button to toggle the panel on/off
• Bookmark caption lines for later review
• Bookmarks page — click the extension icon to see all videos with bookmarks
• Works with both manual and auto-generated YouTube subtitles
• No account required, no data collection — everything runs locally

How it works:
When you visit a YouTube video, Zamak fetches the available subtitle tracks and displays them in a side-by-side panel overlaid on the page. The panel syncs with video playback in real time. Bookmark any caption line, then click the Zamak icon to see all your bookmarked videos at a glance.

Supported: Any YouTube video with subtitles in two or more languages.
```

## Category

```
Education
```

## Language

```
English
```

## Screenshots

Take screenshots at 1280×800 showing:

1. The extension panel open on a YouTube video with dual subtitles visible
2. Close-up of the caption panel showing two language columns
3. The bookmarks page (full tab, opened via extension icon click) showing a list of bookmarked videos

## Privacy

- **Single purpose description**:
  ```
  Display dual-language subtitles on YouTube videos for language learning, with the ability to bookmark caption lines for review.
  ```

- **Permissions justification** (`storage`):
  ```
  The extension uses chrome.storage.local to store a lightweight index of videos where the user has bookmarked caption lines. This allows the bookmarks page (opened via the extension icon) to display the user's bookmarked videos. No data is sent externally.
  ```

- **Host permission justification** (for `https://www.youtube.com/*` content script match):
  ```
  The content script injects a dual-language subtitle panel into YouTube watch pages. It reads the video's existing subtitle tracks via YouTube's in-page player API and displays them side by side for language learners. A second content script (ISOLATED world) relays bookmark metadata from the page to extension storage so the bookmarks page can list bookmarked videos. The scripts only run on youtube.com and do not access any other hosts.
  ```

- **Remote code**: No — all JS is bundled in the extension package, no external script tags, no eval(), no remote Wasm. The bookmarks page loads Google Fonts CSS from `fonts.googleapis.com` (stylesheet only, not script).

- **Data use disclosures**: The extension transmits video ID and selected language to YouTube's timedtext API when fetching subtitles. Local storage on youtube.com includes: track selection preferences (`zamak:selected-tracks`, `zamak:preferred-langs`), theme preference (`zamak:theme`), video bookmark index (`zamak:video-index`), and full caption sessions with bookmarks in IndexedDB (`zamak` database — stores caption text, bookmark text, translations, notes). The video index metadata is also synced to `chrome.storage.local` so the bookmarks page can read it cross-origin. No data is sent to any third-party or external server. No PII, analytics, or tracking.

- **Privacy policy**: A minimal privacy policy stating the extension does not collect personal data is recommended. Per Chrome's [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), even extensions that don't handle sensitive data should explicitly state so.

### Data use rationale

Chrome Web Store defines "user data" broadly as "information provided by a user or collected about a user or a user's use of the Product or Chrome Browser" ([Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)). "Handle" means "collecting, transmitting, using, or sharing user data" ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).

Zamak's data handling:

1. **Fetches subtitles** from YouTube's timedtext API — transmits video ID and language code to YouTube's server
2. **Loads Google Fonts CSS** from `fonts.googleapis.com` / `fonts.gstatic.com` — stylesheet request on bookmarks page only (not script)
3. **Stores in localStorage** (youtube.com origin) — track selection preferences, theme preference, video bookmark index
4. **Stores in IndexedDB** (youtube.com origin, `zamak` database) — full caption sessions including merged caption text and bookmarks (selected text, translations, etymology, notes)
5. **Stores in chrome.storage.local** — video index (title, channel, bookmark count, timestamp) synced from localStorage via relay for cross-origin access
6. **Does not transmit** any data to third-party or external servers — only to YouTube's own domain and Google Fonts
7. **Does not collect** PII, browsing history, authentication info, or any sensitive categories listed in Chrome's [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy)

This data handling is closely related to the extension's single stated purpose, so prominent in-product disclosure is not required per the [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements). A privacy policy explicitly stating what data is handled and that nothing goes to third parties is recommended per the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## Additional Notes

- Host permission pattern: `https://www.youtube.com/*` (content script match)
- Content scripts: MAIN world (subtitle panel) + ISOLATED world (relay for bookmark sync)
- Background service worker: stores video index received from relay + opens bookmarks tab on icon click (`chrome.action.onClicked`)
- Bookmarks page opens as a full tab (not a popup) — manifest has `"action": {}` with no `default_popup`
- Bookmarks page loads Google Fonts CSS externally (stylesheet, not code)
- IndexedDB used on youtube.com origin for caption session + bookmark persistence

## Submission Checklist

- [ ] Bump version in manifest to 0.2.0
- [ ] Update store description and summary
- [ ] Update single purpose description
- [ ] Add `storage` permission justification
- [ ] Take new screenshots (including bookmarks page)
- [ ] Build and zip: `pnpm build-ext`
- [ ] Upload and submit for review
- [ ] Confirm approval
