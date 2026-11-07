# Anki Export

## Problem

The app captures rich vocabulary data (word, translation, etymology, notes, context sentence) but has no way to export it for spaced repetition study. Anki is the standard tool language learners already use. Exporting bookmarks to Anki-importable format closes the loop: **watch → bookmark → AI fill → export → study**.

## Approach

Generate a **TSV file** (tab-separated values) that Anki can import directly. TSV is the simplest format Anki supports — no library needed, just string generation. HTML is allowed in fields.

### Card design

**Front:**

- Bookmarked word/phrase (large)
- Context sentence with the word bolded

**Back:**

- Translation
- Etymology (if present)
- Notes (if present)
- Source: video title

**Tags** (auto-generated, space-separated):

- `zamak` (app identifier)
- `video:<youtubeId>` (group by video)
- Language code (e.g. `ko`, `ja`)

### TSV columns

```
Front\tBack\tTags
```

Front and Back contain HTML. Anki supports this when "Allow HTML in fields" is checked on import (it's the default).

### Filtering

Only export bookmarks that have a `translation` field filled. Empty cards aren't useful for study. Show a toast if no filled bookmarks exist.

## UI

Two export points:

1. **Per-video** (MVP): "Export for Anki" item in caption panel `SettingsDropdown`, next to existing "Export import.json". Downloads `zamak-<youtubeId>-anki.tsv`.

2. **All videos** (follow-up): Button on `BookmarksPage` header. Iterates all videos in IndexedDB, aggregates bookmarks, downloads `zamak-anki-all.tsv`.

## Reference files

- `src/lib/extension-bookmarks.ts` — `ExtensionBookmark` type
- `src/lib/caption-session.ts` — `sessionToExportData()` pattern, `CaptionSessionManager`
- `src/components/caption-panel.tsx` — `SettingsDropdown` component (~line 620+), existing "Export import.json" button (~line 724)
- `src/lib/caption-session-db.ts` — `getSession()` for cross-video access
- `src/lib/video-index.ts` — `videoIndexStore` for listing all videos

## Implementation steps

### Step 1: `src/lib/anki-export.ts`

Pure function, no UI dependencies:

```typescript
export function bookmarksToAnkiTsv(params: {
  bookmarks: ExtensionBookmark[];
  videoTitle: string;
  youtubeId: string;
  language: string;
}): string;
```

- Filter to bookmarks with `translation`
- Generate HTML for front/back
- Escape tabs and newlines in field content
- Prepend TSV header comment: `#separator:tab`, `#html:true`, `#tags column:3`
- Return TSV string

### Step 2: Per-video export UI

Add "Export for Anki" button to `SettingsDropdown` in `caption-panel.tsx`:

- Below existing "Export import.json"
- Calls `bookmarksToAnkiTsv()` with current session data
- Downloads as `.tsv` file (reuse existing download pattern)
- Toast on success with count, or warning if no filled bookmarks

### Step 3: All-videos export (follow-up)

Add export button to `BookmarksPage`:

- Iterate `videoIndexStore` entries
- Load each session from IndexedDB via `getSession()`
- Aggregate all bookmarks with video metadata
- Call `bookmarksToAnkiTsv()` per video, concatenate (skip header for subsequent)
- Download as `zamak-anki-all.tsv`

### Step 4: E2E test

Add test to `dev-viewer.spec.ts` (no auth needed):

- Load fixture with filled bookmarks
- Click settings → "Export for Anki"
- Intercept download, verify TSV content has expected columns/rows

## Status

- [ ] Step 1: anki-export.ts
- [ ] Step 2: Per-video export UI
- [ ] Step 3: All-videos export
- [ ] Step 4: E2E test
