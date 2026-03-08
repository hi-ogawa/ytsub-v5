# Extension Manual Bookmarks

## Problem

The main app supports manual bookmarking (text selection → create bookmark via API), but the extension has no bookmarking at all. The extension's `CaptionList` renders plain text without `data-side`/`data-offset` attributes, so the v3-style DOM walk for text selection doesn't work there.

The PRD specifies:

- Use localStorage for storage (extension has no backend access)
- Include local bookmarks in the `import.json` export

## Current State

**Main app** (`video-viewer.tsx`): Full bookmarking — `data-*` attributes on DOM, `extractBookmarkSelection()`, `selectionchange` listener, floating FABs, `highlightText()` for inline highlights, server-side storage via oRPC.

**Shared `CaptionList`** (`src/components/caption-list.tsx`): Simple text rendering, no `data-side`/`data-offset`, no bookmark awareness. Used by extension and dev-viewer.

**Extension** (`src/extension/content.tsx`): Thin wrapper around `CaptionPanel` → `CaptionList`. No bookmark support.

Key insight: `video-viewer.tsx` does NOT use the shared `CaptionList` — it has its own virtualized rendering with inline bookmark highlights. So all changes to `caption-list.tsx` only affect the extension and dev-viewer.

## Approach

Add bookmark support to the shared `CaptionList` via props. The extension wires these props to localStorage; the dev-viewer can ignore them (or use them for testing).

### Architecture Decisions

1. **Storage**: localStorage with key `zamak:bookmarks` → `{ [youtubeId]: ExtensionBookmark[] }`
2. **Bookmark model** (extension-local):
   ```ts
   type ExtensionBookmark = {
     id: string; // crypto.randomUUID()
     text: string;
     side: number; // 0 = lang1, 1 = lang2
     offset: number; // character offset in caption text
     captionIndex: number; // index in merged rows array
     timestamp: number; // row.begin
     context: string; // full text of the bookmarked side
     createdAt: string; // ISO datetime
   };
   ```
3. **Selection logic**: Extract `extractBookmarkSelection()` to `src/lib/bookmark-selection.ts` — shared between main app and extension (both do the same DOM walk).
4. **Highlight rendering**: Add `highlightText()` to `caption-list.tsx` (simpler version — no popover, just underline styling).
5. **Export**: Generate `import.json` from current video metadata + captions + localStorage bookmarks. Button in caption panel settings dropdown (future) or a standalone export button.

## Reference Files

| File                                   | Role                                           |
| -------------------------------------- | ---------------------------------------------- |
| `src/routes/video-viewer.tsx` L150-195 | `extractBookmarkSelection()` to extract        |
| `src/routes/video-viewer.tsx` L214-252 | `highlightText()` pattern to port              |
| `src/routes/video-viewer.tsx` L532-560 | Selection listener + mutation flow             |
| `src/routes/video-viewer.tsx` L945-968 | Floating FAB UI                                |
| `src/components/caption-list.tsx`      | Shared component to modify                     |
| `src/components/caption-panel.tsx`     | Shared panel — will orchestrate bookmark state |
| `src/extension/content.tsx`            | Extension entry — wire localStorage bookmarks  |
| `scripts/db-seed-gen.ts` L6-34         | `import.json` schema (export target format)    |

## Implementation Steps

### Step 1: Extract `extractBookmarkSelection()` to shared lib

Create `src/lib/bookmark-selection.ts`:

- Move `BookmarkSelection` interface and `extractBookmarkSelection()` from `video-viewer.tsx`
- Import in both `video-viewer.tsx` and the new extension bookmark logic
- No behavior change — just extraction

### Step 2: Add `data-side` and `data-offset` attributes to `CaptionList`

In `src/components/caption-list.tsx`:

- Add `data-side="0"` and `data-side="1"` to the two text divs (currently L111-112)
- Wrap text content in `<span data-offset={0}>` by default (plain text case)
- When bookmarks exist, use `highlightText()` to render segmented spans with correct offsets

### Step 3: Add bookmark props to `CaptionList`

New optional props:

```ts
bookmarksByIndex?: Map<number, ExtensionBookmark[]>;  // bookmarks grouped by captionIndex
```

When provided, `CaptionList` renders bookmarks inline using highlight spans. When absent, behavior unchanged (backward compatible).

### Step 4: Add bookmark highlight rendering

Port a simplified `highlightText()` into `caption-list.tsx`:

- Same offset-based span segmentation as `video-viewer.tsx`
- Simpler highlight: just `border-b-2 border-highlight-border bg-highlight-bg` (no popover, no click-to-navigate)
- Each segment wrapped in `<span data-offset={N}>` for selection support

### Step 5: Add selection handling + floating FABs to `CaptionPanel`

In `src/components/caption-panel.tsx`, add optional bookmark mode:

- New props: `onCreateBookmark?: (selection: BookmarkSelection) => void`
- When `onCreateBookmark` is provided:
  - Listen for `selectionchange` events
  - Use `extractBookmarkSelection()` to parse selection
  - Show floating bookmark/cancel FABs
  - On confirm → call `onCreateBookmark(selection)` callback
- When absent, no bookmark UI (backward compatible)

Note: in the extension's shadow DOM, `document.getSelection()` may need to use `shadowRoot.getSelection()` or the shadow root's selection API. Verify this works.

### Step 6: localStorage bookmark store

Create `src/lib/extension-bookmarks.ts`:

- `getBookmarks(youtubeId: string): ExtensionBookmark[]`
- `addBookmark(youtubeId: string, bookmark: Omit<ExtensionBookmark, 'id' | 'createdAt'>): ExtensionBookmark`
- `deleteBookmark(youtubeId: string, bookmarkId: string): void`
- `getAllBookmarks(): Record<string, ExtensionBookmark[]>`
- All read/write to `localStorage` key `zamak:bookmarks`

### Step 7: Wire extension content.tsx

In `src/extension/content.tsx`:

- Read bookmarks from localStorage for current videoId
- Group by `captionIndex` → pass as `bookmarksByIndex` to `CaptionList` (via `CaptionPanel`)
- Provide `onCreateBookmark` callback that calls `addBookmark()` and triggers re-render
- Pass bookmarks through `CaptionPanel` to `CaptionList`

### Step 8: Export import.json

Add export button to the extension panel (e.g., in the caption panel header or a settings dropdown):

- Collect current video metadata (from `fetchPlayerApi` result)
- Collect current merged captions
- Collect localStorage bookmarks for this video
- Map to `import.json` format:
  ```json
  {
    "video": { "youtubeId", "title", "channelName", "channelId", "duration", "language1", "language2" },
    "captions": [{ "idx", "begin", "end", "text1", "text2" }],
    "bookmarks": [{ "text", "translation": "", "captionIdx", "side", "offset", "context", "status": "manual" }]
  }
  ```
- Trigger download as `{youtubeId}-import.json`

### Step 9: Update `video-viewer.tsx` to use shared extraction

Replace inline `extractBookmarkSelection()` with import from `src/lib/bookmark-selection.ts`. No behavior change.

### Step 10: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`
- Manual test via dev-viewer: select text → FABs appear → create bookmark → highlight appears
- Manual test via extension: same flow + verify localStorage persistence + export

## Edge Cases

- **Shadow DOM selection**: `document.getSelection()` may not work inside shadow DOM in all browsers. Chromium supports `shadowRoot.getSelection()` (non-standard). May need to use `document.getSelection()` and validate the selection is within our shadow root.
- **Caption re-merge**: If user changes track selection, caption indices change. Bookmarks tied to old indices become stale. Options: (a) clear bookmarks on track change, (b) store enough context (text + side) to re-match. Start with (a) — simpler, and track changes are rare.
- **Overlapping bookmarks**: Same handling as main app — each bookmark is independent, multiple highlights can overlap.
- **Large bookmark lists**: localStorage has ~5MB limit. Each bookmark is ~200 bytes. 25,000 bookmarks before hitting limits — not a concern.

## Status

- [ ] Planning — awaiting feedback
