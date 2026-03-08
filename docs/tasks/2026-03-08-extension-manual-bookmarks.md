# Extension Manual Bookmarks

## Problem

The extension (and dev-viewer) caption panel has no bookmarking. Users should be able to select text in captions and create bookmarks stored in localStorage, then export them in `import.json`.

## Current State (after latest main)

- **`CaptionPanel`** (`caption-panel.tsx`): Already has settings dropdown with "Export import.json" button, but exports `bookmarks: []`. Has `videoMeta` prop with video info. Renders `CaptionViewer` → `CaptionList`.
- **`CaptionList`** (`caption-list.tsx`): Plain text rendering — no `data-side`/`data-offset` attributes, no bookmark awareness.
- **`video-viewer.tsx`**: Has its own bookmark system (server-backed, virtualized rendering). Not touched in this task — it does NOT use the shared `CaptionList`.
- **Export**: Already wired — `handleExport()` in `caption-panel.tsx` L253-283 builds `import.json` with `bookmarks: []`.

## Approach

All work in shared components (`caption-list.tsx`, `caption-panel.tsx`) + one new lib file. No changes to `video-viewer.tsx` or `content.tsx`.

### Data Model

```ts
// src/lib/extension-bookmarks.ts
type ExtensionBookmark = {
  id: string; // crypto.randomUUID()
  text: string;
  side: number; // 0 = lang1, 1 = lang2
  offset: number; // character offset in caption text
  captionIndex: number; // index in merged rows array
  timestamp: number; // row.begin
  context: string; // full text on the bookmarked side
  createdAt: string; // ISO datetime
};
// localStorage key: zamak:bookmarks:{youtubeId}
```

### Selection Logic

Reuse the same DOM walk pattern from `video-viewer.tsx`:

- `data-index` → caption row index (already exists on `CaptionList` rows, L89)
- `data-side` → language side (add to text divs)
- `data-offset` → character offset within text (add spans)

Walk: text node → `span[data-offset]` → `div[data-side]` → up to `div[data-index]`

## Reference Files

| File                                        | Role                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `src/routes/video-viewer.tsx` L157-195      | `extractBookmarkSelection()` — DOM walk pattern    |
| `src/routes/video-viewer.tsx` L214-252      | `highlightText()` — offset-based span segmentation |
| `src/components/caption-list.tsx`           | Shared component to modify                         |
| `src/components/caption-panel.tsx` L253-283 | Existing export (needs bookmarks filled in)        |
| `src/components/caption-panel.tsx` L363-406 | `CaptionViewer` — passes props to `CaptionList`    |

## Implementation Steps

### Step 1: Create `src/lib/extension-bookmarks.ts`

localStorage CRUD for bookmarks:

- `getBookmarks(youtubeId): ExtensionBookmark[]`
- `addBookmark(youtubeId, data): ExtensionBookmark`
- `deleteBookmark(youtubeId, bookmarkId): void`
- `extractBookmarkSelection(selection: Selection): BookmarkSelection | undefined` — the DOM walk logic (same algorithm as video-viewer.tsx but written fresh in this file)

Key: `zamak:bookmarks:{youtubeId}` (one key per video, simpler than nested object).

### Step 2: Add `data-side`, `data-offset` to `CaptionList` + highlight rendering

In `caption-list.tsx`:

- Add `data-side="0"` / `data-side="1"` to the two text divs (L105-106)
- Add `highlightText()` function: takes text + bookmark marks → returns spans with `data-offset` attributes and highlight styling
- When no bookmarks for a row, render `<span data-offset={0}>{text}</span>` (still needs the attribute for selection to work)

### Step 3: Add bookmark props to `CaptionList` and `CaptionViewer`

New optional props on `CaptionList`:

```ts
bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
```

Thread through `CaptionViewer` → `CaptionList`. When provided, compute marks per row and call `highlightText()`. When absent, same as today but with data attributes added.

### Step 4: Add selection handling + floating FABs to `CaptionPanel`

New optional props on `CaptionPanel`:

```ts
onCreateBookmark?: (sel: { captionIndex: number; side: number; offset: number; text: string }) => void;
bookmarksByIndex?: Map<number, ExtensionBookmark[]>;
```

When `onCreateBookmark` is provided:

- Listen for `selectionchange` (on `document` — works for both regular DOM and shadow DOM in Chromium)
- Use `extractBookmarkSelection()` to parse
- Show floating bookmark/cancel FAB buttons (same style as video-viewer.tsx)
- On confirm → call `onCreateBookmark`, clear selection

Pass `bookmarksByIndex` through to `CaptionViewer` → `CaptionList`.

### Step 5: Wire bookmarks in `content.tsx`

- `useState` for bookmarks, initialized from `getBookmarks(videoId)`
- `onCreateBookmark` callback: call `addBookmark()`, update state
- Group bookmarks by `captionIndex` into a `Map`, pass to `CaptionPanel`
- No changes to extension architecture — just new props

### Step 6: Include bookmarks in export

In `caption-panel.tsx` `handleExport()`:

- Accept bookmarks via the existing data flow (new prop or from the bookmark map)
- Map `ExtensionBookmark[]` to import.json bookmark format:
  ```ts
  { text, translation: "", captionIdx: captionIndex, side, offset, context, status: "manual" }
  ```

### Step 7: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`
- Test via dev-viewer: select text → FABs appear → create bookmark → highlight appears → export includes bookmark

## Edge Cases

- **Shadow DOM selection**: `document.getSelection()` works in Chromium for shadow DOM content. The DOM walk navigates `parentElement` which stays within the shadow tree. Should work without special handling.
- **Caption re-merge on track change**: Bookmarks store `captionIndex` which is tied to the merged row array. If tracks change, indices may shift. For v1: bookmarks only display when indices still match. Could add text-based re-matching later.
- **DOM structure**: The walk expects text → `span[data-offset]` → `div[data-side]` → `div` (flex row) → `div[data-index]`. Match this exactly in `CaptionList`.

## Status

- [ ] Planning — awaiting feedback
