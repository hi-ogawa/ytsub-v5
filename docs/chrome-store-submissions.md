# Chrome Web Store Submission Details

Full listing details for the next Chrome Web Store submission. Copy-paste into the Developer Dashboard.

## Agent Workflow

When preparing a new version for submission:

1. **Review this doc** against the current codebase — check manifest version, feature list, privacy disclosures
2. **Diff against `docs/prd.md`** — identify features shipped since the last submission that aren't reflected in the store description
3. **Update this doc** — bump version, add new features to the description, fix any stale info
4. **Update the manifest** — bump `version` in `src/extension/public/manifest.json`, sync `description` with the store summary
5. **Commit and PR** — the user handles screenshots, build, upload, and submission manually

## Build & Package

```sh
pnpm build-ext   # build with production name "Zamak"
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
• Bookmark caption lines — select text to create bookmarks with notes
• Bookmark editor — review and edit bookmarks with AI prompt support (copy context to clipboard, paste into your favorite LLM)
• Bookmarks page — click the extension icon to see all videos with bookmarks
• Settings dropdown — configure caption alignment, auto-scroll, and export data
• Adapts to YouTube's dark and light theme automatically
• Works with both manual and auto-generated YouTube subtitles
• Auto-translated captions — works even when only one language track is available
• Optional sign-in — sync bookmarks to the cloud across devices (no account required for local-only use)

How it works:
When you visit a YouTube video, Zamak fetches the available subtitle tracks and displays them in a side-by-side panel overlaid on the page. The panel syncs with video playback in real time. Select any text to bookmark it, then use the built-in editor to add translations and notes — or copy an AI prompt to get help from your favorite LLM. Click the Zamak icon to see all your bookmarked videos at a glance.

Supported: Any YouTube video with subtitles. Works best with videos that have two or more language tracks, but also supports auto-translated captions for single-language videos.

The project is open source and the source code is available on https://github.com/hi-ogawa/ytsub-v5.
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

**How to capture:**

1. Open Chrome with the `chrome-extension-screenshot` profile — it's configured for 1280×800 at 1x pixel density (non-mobile)
2. Set up the scene (navigate to the right page, open panels, etc.)
3. DevTools → Cmd+Shift+P → "Capture full size screenshot" (or "Capture screenshot" for viewport only)

**Scenes to capture:**

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
  The extension uses chrome.storage.local to store a lightweight index of videos where the user has bookmarked caption lines (for the bookmarks page), and optionally an authentication token and username when the user signs in to sync bookmarks.
  ```

- **Host permission justification** (for `https://www.youtube.com/*` content script match):

  ```
  The content script injects a dual-language subtitle panel into YouTube watch pages. It reads the video's existing subtitle tracks via YouTube's in-page player API and displays them side by side for language learners. A second content script (ISOLATED world) relays bookmark metadata from the page to extension storage so the bookmarks page can list bookmarked videos. The scripts only run on youtube.com and do not access any other hosts. The bookmarks page (extension page, not content script) optionally communicates with the project's server (ytsub-v5.hiroshi.workers.dev) for user authentication and bookmark sync via standard CORS fetch — no host permissions are required for this.
  ```

- **Remote code**: No — all JS is bundled in the extension package, no external script tags, no eval(), no remote Wasm. The bookmarks page loads Google Fonts CSS from `fonts.googleapis.com` (stylesheet only, not script).

- **Data use disclosures**: The extension transmits video ID and selected language to YouTube's timedtext API when fetching subtitles. Local storage on youtube.com includes: track selection preferences (`zamak:selected-tracks`, `zamak:preferred-langs`), theme preference (`zamak:theme`), video bookmark index (`zamak:video-index`), and full caption sessions with bookmarks in IndexedDB (`zamak` database — stores caption text, bookmark text, translations, notes). The video index metadata is also synced to `chrome.storage.local` so the bookmarks page can read it cross-origin. When the user opts in by signing in, the bookmarks page sends authentication credentials (username/password) and bookmark data to the project's own server (`ytsub-v5.hiroshi.workers.dev`) for sync. An auth token is stored in `chrome.storage.local`. No data is sent to any third-party server. No analytics or tracking.

- **Privacy policy**: A privacy policy is required since the extension now handles authentication credentials (opt-in). It should state that credentials are only used for authentication, bookmark data is synced to the project's own server, and no data is shared with third parties. Per Chrome's [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), extensions that handle user data must disclose this.

### Data use rationale

Chrome Web Store defines "user data" broadly as "information provided by a user or collected about a user or a user's use of the Product or Chrome Browser" ([Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)). "Handle" means "collecting, transmitting, using, or sharing user data" ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).

Zamak's data handling:

1. **Fetches subtitles** from YouTube's timedtext API — transmits video ID and language code to YouTube's server
2. **Loads Google Fonts CSS** from `fonts.googleapis.com` / `fonts.gstatic.com` — stylesheet request on bookmarks page only (not script)
3. **Stores in localStorage** (youtube.com origin) — track selection preferences, theme preference, video bookmark index
4. **Stores in IndexedDB** (youtube.com origin, `zamak` database) — full caption sessions including merged caption text and bookmarks (selected text, translations, etymology, notes)
5. **Stores in chrome.storage.local** — video index (title, channel, bookmark count, timestamp) synced from localStorage via relay for cross-origin access; optionally auth token and username when signed in
6. **Syncs bookmarks** (opt-in) — when signed in, the bookmarks page sends credentials and bookmark data to the project's own server (`ytsub-v5.hiroshi.workers.dev`) via CORS fetch. No host permissions needed.
7. **Does not transmit** data to any third-party servers — only to YouTube's own domain, Google Fonts, and the project's own server (opt-in sync)
8. **Does not collect** browsing history or any sensitive categories listed in Chrome's [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy). Authentication credentials are only transmitted when the user explicitly signs in.

This data handling is closely related to the extension's single stated purpose, so prominent in-product disclosure is not required per the [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements). A privacy policy explicitly stating what data is handled and that nothing goes to third parties is recommended per the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## Additional Notes

- No host permissions — server communication uses standard CORS fetch from extension pages
- Content script match pattern: `https://www.youtube.com/*` (content scripts only, no server calls)
- Content scripts: MAIN world (subtitle panel) + ISOLATED world (relay for bookmark sync)
- Background service worker: stores video index received from relay + opens bookmarks tab on icon click (`chrome.action.onClicked`)
- Bookmarks page opens as a full tab (not a popup) — manifest has `"action": {}` with no `default_popup`
- Bookmarks page: login/logout UI, optional bookmark sync with project server, loads Google Fonts CSS externally (stylesheet, not code)
- IndexedDB used on youtube.com origin for caption session + bookmark persistence

## Test Instructions

The submission form asks for test credentials "if login, authentication, or specific setup is required" to access core functionality. Zamak's core features (dual subtitles, bookmarks) work fully without login — sign-in is optional for sync only. Leave this field blank unless login becomes required for core functionality.

## Submission Checklist

- [x] Bump version in manifest to 0.2.0
- [x] Update manifest description
- [x] Update store description and summary
- [x] Add `storage` permission justification
- [x] Update privacy disclosures for auth/sync
- [ ] Add privacy policy (required for auth handling)
- [ ] Take new screenshots (including bookmarks page, bookmark editor, settings dropdown)
- [ ] Build and zip: `pnpm build-ext`
- [ ] Upload and submit for review
- [ ] Confirm approval
