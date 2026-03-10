# Consolidate Caption Panel (extension/dev-viewer/video-viewer)

## Problem

The codebase has two independent caption panel implementations with massive duplication:

1. **Shared components** (`components/caption-panel.tsx` + `caption-list.tsx`) — used by extension + dev-viewer
2. **Video-viewer** (`routes/video-viewer.tsx`) — self-contained, server-backed

They duplicate: `BookmarkWord`, `highlightText`, `BookmarksList`, `extractBookmarkSelection`, `formatTimestamp`, auto-scroll logic, tab bar, bookmark navigation, bookmark creation FAB, click-to-seek.

Key differences:

| Aspect           | Extension/dev-viewer                                 | Video-viewer                                    |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Caption list     | Plain `.map()` render                                | `@tanstack/react-virtual`                       |
| Caption type     | `MergedCaption` (has segments, cue indices)          | `Caption` (flat DB row)                         |
| Bookmark type    | `ExtensionBookmark` (string UUID, `captionIndex`)    | `Bookmark` (number ID, `captionId`)             |
| Bookmark lookup  | `bookmarksByIndex: Map<number, ExtensionBookmark[]>` | `bookmarksByCaptionId: Map<number, Bookmark[]>` |
| Bookmark storage | IndexedDB (local)                                    | Server DB via oRPC mutations                    |
| Auto-scroll      | `scrollIntoView()` on DOM element                    | `virtualizer.scrollToIndex()`                   |
| Cross-tab nav    | `onGoToCaption(captionIndex)`                        | `onGoToCaption(captionId)` → looks up index     |
| Settings         | Track picker, alignment strategy, export, AI prompt  | Auto-scroll toggle only                         |

## Approach

**Bottom-up**: extract shared primitives first, then compose into a unified panel.

### Step 1: Common types

Create `src/lib/caption-types.ts`:

```ts
// Minimal row interface both Caption and MergedCaption satisfy
export type CaptionRow = {
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

// Minimal bookmark interface both ExtensionBookmark and Bookmark satisfy
export type BookmarkItem = {
  id: string | number;
  text: string;
  side: number;
  offset: number;
  timestamp: number;
  translation: string;
  etymology: string;
  notes: string;
};
```

### Step 2: Extract shared rendering components

Move from `caption-list.tsx` to a new shared location (or keep in `caption-list.tsx`):

- `BookmarkWord` — parameterize on `BookmarkItem` instead of `ExtensionBookmark`/`Bookmark`
- `highlightText` — same
- `formatTimestamp` — already duplicated in 3 places

### Step 3: Virtualized CaptionList

Replace the plain `.map()` in `CaptionList` with `@tanstack/react-virtual`. The extension already bundles React — adding react-virtual is minimal overhead.

The current `CaptionList` already has the right shape:

- `scrollToIndex(index)` via imperative handle
- `data-index` on each row
- Auto-scroll via `useEffect` on `currentIndex`

Change: swap the inner render to use `useVirtualizer`, adopt the same `translateY` positioning as video-viewer.

### Step 4: Shared BookmarksList

Extract a generic `BookmarksList` that accepts:

```ts
{
  bookmarks: BookmarkItem[];
  getCaptionForBookmark: (bm: BookmarkItem) => CaptionRow | undefined;
  player: YTPlayer | null;
  onDeleteBookmark: (id: string | number) => void;
  onGoToCaption: (bm: BookmarkItem) => void;
  flashBookmarkId: string | number | null;
}
```

Both current implementations render near-identical markup.

### Step 5: Unified CaptionPanel

The shared `CaptionPanel` currently handles extension-specific concerns (track picker, alignment strategy, export, AI prompts). The video-viewer has its own simpler tab bar.

**Option A**: Make `CaptionPanel` accept optional slots/props for the header (track picker etc.) and use it from video-viewer too.
**Option B**: Keep `CaptionPanel` for extension/dev-viewer but have both use the same `CaptionList` + `BookmarksList`.

**Recommendation: Option B** — the extension panel has significantly different header UX (track picker, strategy selector, AI prompts, export). Forcing it into a generic component adds complexity without benefit. The win is in sharing the _content area_ (caption list + bookmarks list + bookmark creation + auto-scroll), not the shell.

### Step 6: Video-viewer uses shared CaptionList

Refactor `video-viewer.tsx` to:

1. Map `Caption[]` + `bookmarksByCaptionId` to the shape CaptionList expects (`CaptionRow[]` + `bookmarksByIndex`)
2. Use the shared `CaptionList` component (now virtualized)
3. Use the shared `BookmarksList` component
4. Keep video-viewer-specific data fetching (oRPC queries/mutations) in the route

### Step 7: Data layer abstraction

Create a `useCaptionPanelData` hook interface:

```ts
type CaptionPanelData = {
  rows: CaptionRow[];
  bookmarksByIndex: Map<number, BookmarkItem[]>;
  sortedBookmarks: BookmarkItem[];
  createBookmark: (sel: BookmarkSelection) => void;
  deleteBookmark: (id: string | number) => void;
  isCreating: boolean;
  getCaptionForBookmark: (bm: BookmarkItem) => CaptionRow | undefined;
};
```

Two implementations:

- `useCaptionPanelDataServer(videoId)` — oRPC queries + mutations (video-viewer)
- Extension already has `CaptionSessionManager` which provides similar shape

This is lower priority — the rendering consolidation (steps 1-6) provides most of the value.

## Implementation Order

1. Common types (`caption-types.ts`)
2. Extract `BookmarkWord`, `highlightText`, `formatTimestamp` to work with `BookmarkItem`
3. Add virtualization to `CaptionList`
4. Extract shared `BookmarksList`
5. Wire video-viewer to use shared `CaptionList` + `BookmarksList`
6. (Later) Data layer abstraction

## Reference Files

- `src/components/caption-list.tsx` — current plain-render list (308 lines)
- `src/components/caption-panel.tsx` — extension/dev-viewer panel (775 lines)
- `src/routes/video-viewer.tsx` — video-viewer with inline virtualized list (992 lines)
- `src/lib/extension-bookmarks.ts` — `ExtensionBookmark` type + `extractBookmarkSelection`

## Status

- **Planning** — awaiting feedback
