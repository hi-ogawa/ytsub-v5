# Bookmark Popover Fixes

## Problems

1. **Overlapping popovers** — Each `BookmarkWord` manages its own `open` state with a 300ms close timer. Hovering from one bookmark to another opens the new popover while the old one is still visible.
2. **Upward-only positioning** — Popover is hardcoded `bottom-full` (above the word). Bookmarks near the top of the scroll container get clipped.

## Reference

- `src/routes/video-viewer.tsx`
  - `BookmarkWord` component (lines 228-293): local `open` state + `closeTimer`
  - `highlightText` function (lines 190-226): renders `BookmarkWord` instances
  - `VideoViewerPage` (lines 420-972): parent component
  - Scroll container: `scrollElementRef` (line 550), has `overflow-y-auto` (line 809)

## Approach

### Fix 1: Dismiss previous popover when new one opens

Lift popover state from `BookmarkWord` to `VideoViewerPage` so only one can be active.

1. Add to `VideoViewerPage`:
   - `const [activeBookmarkId, setActiveBookmarkId] = useState<number | null>(null)`
   - `const activeBookmarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)`
   - Handler: `onHoverBookmark(id)` — clear pending timer, set `activeBookmarkId = id`
   - Handler: `onLeaveBookmark()` — start 300ms timer to set `activeBookmarkId = null`

2. Pass through `highlightText` to `BookmarkWord`:
   - `activeBookmarkId`, `onHoverBookmark`, `onLeaveBookmark`

3. In `BookmarkWord`:
   - Remove local `open` / `closeTimer` state
   - Derive `isOpen = activeBookmarkId === bookmark.id`
   - Call `onHoverBookmark(bookmark.id)` on mouse enter
   - Call `onLeaveBookmark()` on mouse leave

### Fix 2: Allow upward or downward popover positioning

Add position detection in `BookmarkWord` when it becomes active.

1. Add a ref to the outer `<span>` in `BookmarkWord`
2. When `isOpen` becomes true, check available space above:
   - `spanRef.current.getBoundingClientRect().top` vs scroll container top (or viewport)
   - If space above < ~80px, position below (`top-full mt-1`)
   - Otherwise keep above (`bottom-full mb-1`)
3. Store direction in local state (`popoverBelow: boolean`)
4. Reset on close

## Status

- [x] Fix 1: Lift popover state
- [x] Fix 2: Dynamic positioning
- Done
