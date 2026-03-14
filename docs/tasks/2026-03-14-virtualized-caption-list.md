# Virtualized Caption List for Extension

**Goal:** Add `@tanstack/react-virtual` to the extension's `CaptionList` component so it handles large subtitle files (1000+ cues) without rendering all rows.

## Context

The web app (`video-viewer.tsx`) already uses `useVirtualizer` for its caption list. The extension (`caption-list.tsx`) renders all rows with a plain `.map()`. This task adds virtualization to the extension path.

`@tanstack/react-virtual` is already in `package.json`.

### Bookmark list — not in scope

Neither side virtualizes the bookmark list (`BookmarksList` in video-viewer, `ExtensionBookmarksList` in extension) — both use plain `.map()`. Bookmarks are user-created, so counts stay low (tens, not thousands). Virtualizing them isn't worth the complexity.

## Reference: video-viewer.tsx virtualizer pattern

```tsx
const virtualizer = useVirtualizer({
  count: captions.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 100,
  overscan: 5,
});

// Container
<div style={{ height: virtualizer.getTotalSize() }}>
  <div style={{ transform: `translateY(${items[0].start}px)` }}>
    {items.map((item) => (
      <div
        key={item.key}
        ref={virtualizer.measureElement}
        data-index={item.index}
      >
        ...
      </div>
    ))}
  </div>
</div>;
```

## Key differences to account for

| Aspect            | video-viewer                               | caption-list                           |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| Data              | `Caption[]` from server                    | `MergedCaption[]` from merge logic     |
| Scroll target     | `virtualizer.scrollToIndex()`              | DOM `querySelector` + `scrollIntoView` |
| Imperative handle | none                                       | `scrollToIndex()` via `forwardRef`     |
| Auto-scroll check | `virtualizer.getVirtualItems()` item.start | DOM `el.offsetTop`                     |

## Implementation plan

### 1. Add `useVirtualizer` to `CaptionList`

- Import `useVirtualizer` from `@tanstack/react-virtual`
- Configure with `count: rows.length`, `getScrollElement: () => scrollRef.current`, `estimateSize: () => 100`, `overscan: 5`
- Replace the `.map(rows)` block with the virtualizer container pattern (outer div with `getTotalSize()` height, inner div with `translateY`, iterate `getVirtualItems()`)
- Add `ref={virtualizer.measureElement}` to each row div

### 2. Update auto-scroll threshold logic

Current code (lines ~203-227) uses DOM `offsetTop`/`offsetHeight` to calculate item position. Switch to virtualizer-aware approach:

- Find the virtual item via `virtualizer.getVirtualItems().find(v => v.index === currentIndex)`
- Use `item.start + item.size / 2` for item center instead of DOM measurements
- Keep the same threshold: `clientHeight / 6`
- Replace `el.scrollIntoView()` with `virtualizer.scrollToIndex(currentIndex, { align: "center", behavior: "smooth" })`

### 3. Update `scrollToIndex` imperative handle

Current implementation queries DOM with `querySelector([data-index])` + `scrollIntoView`. Replace with `virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" })`.

### 4. Update `onClickRow`

No structural changes needed — the click handler reads `data-index` from the event target's parent, which still exists on virtualized rows. Just verify it works.

### 5. Verify bookmark text selection

`extractBookmarkSelection()` walks DOM structure (`data-offset` → `data-side` → `data-index`). This should still work since virtualized rows have the same DOM structure — just fewer of them in the DOM at once. Test with:

- Selecting text in a visible row
- Selecting text near the edge of the viewport (where rows may be entering/leaving)

## Files to modify

- `src/components/caption-list.tsx` — main changes (virtualizer setup, scroll logic, imperative handle)

## Testing

- Dev-viewer with fixture data (no extension needed)
- Verify: auto-scroll tracks playback, click-to-seek works, bookmark text selection works, `scrollToIndex` from bookmark tab works
- Test with large caption files to confirm performance improvement

## Status

- [x] Plan approved
- [x] Implementation
- [x] Verification — 77/78 E2E pass; 1 pre-existing flaky test (strategy dropdown count assertion, unrelated)
