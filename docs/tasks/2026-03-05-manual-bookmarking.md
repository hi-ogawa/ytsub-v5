# Manual Bookmarking — Text Selection to Create Bookmark

## Problem

Currently bookmarks are only created via the agent skill (bulk import). Users need to manually select text in the caption panel to create bookmarks while watching videos — the core interactive learning loop.

## Approach

Port the v3 text selection bookmarking pattern: render caption text with `data-index`/`data-side`/`data-offset` attributes, listen for `selectionchange`, walk the DOM to extract bookmark coordinates, show floating action buttons to confirm.

## Reference: v3 Implementation

**Key files in `~/code/personal/ytsub-v3`:**

| File                                    | What                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `app/routes/videos/_utils.tsx` L28-86   | `extractBookmarkSelection()` — DOM walk from selected text node up to data attributes       |
| `app/routes/videos/_utils.tsx` L88-92   | `BOOKMARK_DATA_ATTR` enum — `data-index`, `data-side`, `data-offset`                        |
| `app/routes/videos/_ui.tsx` L27-139     | `CaptionEntryComponent` — renders data attributes on entry div, side divs, and offset spans |
| `app/routes/videos/$id.tsx` L94,256-259 | `selectionchange` listener → `extractBookmarkSelection()` → `setBookmarkState()`            |
| `app/routes/videos/$id.tsx` L222-237    | `onClickBookmark()` / `onCancelBookmark()` handlers                                         |
| `app/routes/videos/$id.tsx` L320-356    | Floating FAB (bookmark + cancel) with scale/opacity transition                              |

**v3 flow:**

1. Caption text rendered as `<span data-offset={N}>` segments (from `partitionRanges` / `HighlightText`)
2. Side containers have `data-side="0"` / `data-side="1"`
3. Entry wrapper has `data-index={virtualItem.index}`
4. `selectionchange` event fires → `extractBookmarkSelection()` walks DOM:
   - `startContainer.parentElement` → get `data-offset`
   - `.parentElement` → get `data-side`
   - `.parentElement.parentElement` → get `data-index`
   - Compute final offset: `Number(data-offset) + startOffset`
5. Valid selection → show floating bookmark/cancel buttons (bottom-right, animated)
6. Click bookmark → `createBookmark` mutation with `{ videoId, captionId, text, side, offset }`
7. Click cancel or mutation success → `removeAllRanges()`

## Current v5 State

**`src/routes/video-viewer.tsx`:**

- `data-index` already exists on entry div (L545) — used by virtualizer
- `data-side` NOT present on side divs (L569, L574)
- `data-offset` NOT present on text spans — `highlightText()` (L141-161) renders `<BookmarkWord>` spans without offset attributes; plain text segments are raw strings (no wrapping span)

**Schema (`src/server/schema.ts` L41-65):** Bookmark table already has `side`, `offset`, `captionId`, `text` fields — no schema changes needed.

**API (`src/server/routes/bookmarks.ts`):** `createBookmarks` accepts array — works for single bookmark too.

## Implementation Steps

### Step 1: Add data attributes to caption rendering

In `video-viewer.tsx`:

- Add `data-side="0"` / `data-side="1"` to the two side `<div>`s (L569, L574)
- Modify `highlightText()` to wrap ALL text segments in `<span data-offset={N}>`, not just highlighted ones
- When no marks exist, wrap the full text in `<span data-offset={0}>` instead of rendering raw string

### Step 2: Add `extractBookmarkSelection()` utility

Port from v3 `_utils.tsx`. Place in `video-viewer.tsx` (single file convention).

```ts
interface BookmarkSelection {
  captionEntryIndex: number;
  side: number;
  offset: number;
  text: string;
}

function extractBookmarkSelection(
  selection: Selection,
): BookmarkSelection | undefined {
  const text = selection.toString();
  if (!text.trim()) return;
  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  const { startContainer, startOffset, endContainer } = range;
  if (
    startContainer.nodeType !== Node.TEXT_NODE ||
    endContainer.nodeType !== Node.TEXT_NODE
  )
    return;

  const startEl = startContainer.parentElement;
  const endEl = endContainer.parentElement;
  const dataOffset = startEl?.getAttribute("data-offset");
  if (!startEl || !endEl || !dataOffset) return;

  // Both ends must be in the same data-side container
  const sideEl = startEl.parentElement;
  const dataSide = sideEl?.getAttribute("data-side");
  if (!sideEl || !dataSide || startEl.parentElement !== endEl.parentElement)
    return;

  // Walk up to data-index (side → click-div → entry-div)
  const indexEl = sideEl.parentElement?.parentElement;
  const dataIndex = indexEl?.getAttribute("data-index");
  if (!indexEl || !dataIndex) return;

  return {
    captionEntryIndex: Number(dataIndex),
    side: Number(dataSide),
    offset: Number(dataOffset) + startOffset,
    text,
  };
}
```

### Step 3: Selection state and event listener

In `CaptionPanel` (or the viewer component):

```ts
const [bookmarkSelection, setBookmarkSelection] = useState<BookmarkSelection>();

useEffect(() => {
  const handler = () => {
    const sel = document.getSelection() ?? undefined;
    setBookmarkSelection(sel ? extractBookmarkSelection(sel) : undefined);
  };
  document.addEventListener("selectionchange", handler);
  return () => document.removeEventListener("selectionchange", handler);
}, []);
```

### Step 4: Create bookmark mutation

```ts
const createBookmarkMutation = useMutation(/* createBookmarks orpc call */);

function onClickBookmark() {
  if (!bookmarkSelection) return;
  const entry = captions[bookmarkSelection.captionEntryIndex];
  createBookmarkMutation.mutate({
    bookmarks: [
      {
        videoId: video.id,
        captionId: entry.id,
        text: bookmarkSelection.text,
        side: bookmarkSelection.side,
        offset: bookmarkSelection.offset,
      },
    ],
  });
  document.getSelection()?.removeAllRanges();
}

function onCancelBookmark() {
  document.getSelection()?.removeAllRanges();
  setBookmarkSelection(undefined);
}
```

Invalidate bookmarks query on success so highlights update immediately.

### Step 5: Floating action buttons UI

Render at bottom-right of the caption panel (same positioning as v3). Two circular buttons:

- Cancel (X icon) — calls `onCancelBookmark()`
- Bookmark (bookmark icon) — calls `onClickBookmark()`, shows spinner during mutation

Use CSS transition for scale/opacity animation on show/hide. Keep it simple — no library needed, just conditional rendering with transition classes.

### Step 6: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`
- Manual test: select text in caption → floating buttons appear → click bookmark → highlight appears

## Edge Cases

- **Cross-entry selection**: v3 rejects selections where start/end are in different `data-side` containers — same approach here
- **Overlapping bookmarks**: `highlightText` already handles multiple marks per text; new bookmark at overlapping offset should work (offsets are independent)
- **Virtualizer re-render**: selection may be lost when virtualizer recycles items during scroll — acceptable, same as v3

## Status

- **Not started**
