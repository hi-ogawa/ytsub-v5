# Privacy Policy — Zamak

**Last updated:** 2026-03-14

Zamak ("the extension") does not collect, transmit, or share any personal data.

## What the extension stores

All data is stored locally on your device:

- **Caption preferences** — selected language tracks, theme preference (localStorage on youtube.com)
- **Bookmarks** — caption text you bookmark, along with any translations or notes you add (IndexedDB on youtube.com)
- **Video index** — titles and bookmark counts for your bookmarked videos (chrome.storage.local, for the bookmarks page)

## What the extension transmits

- **YouTube subtitle requests** — video ID and language code are sent to YouTube's own timedtext API to fetch subtitle tracks. This is a direct request to YouTube, not to any third-party server.
- **Google Fonts CSS** — the bookmarks page loads a stylesheet from fonts.googleapis.com. No scripts are loaded externally.

## What the extension does NOT do

- Collect personal information, browsing history, or analytics
- Send data to any third-party or external server
- Use cookies, tracking pixels, or fingerprinting
- Require an account or login

## Contact

For questions about this policy, open an issue at https://github.com/hi-ogawa/ytsub-v5/issues.
