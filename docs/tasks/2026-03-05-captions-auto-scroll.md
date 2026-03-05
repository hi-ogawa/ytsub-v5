# Captions View Auto-Scroll Tweaks

## Problem

Current auto-scroll in `src/routes/video-viewer.tsx` (lines 310-351):

- Uses `behavior: "auto"` (instant jump) - not smooth
- Always auto-scrolls when playing - no way to pause it during user interaction (e.g., scrolling to read ahead)
- No toggle to disable auto-scroll entirely

## Reference

### ytsub-v3 (`ytsub-v3/app/routes/videos/$id.tsx`)

- **Toggle**: `autoScrollState` stored in localStorage per video ID, toggled via a menu button
- **Conditional scroll**: only scrolls when `autoScroll && nextEntry && nextEntry !== currentEntry`
- Same threshold logic (clientHeight/6) and `behavior: "auto"`
- No smooth scroll or interaction-pause

### ytsub-v4 (`ytsub-v4/src/entrypoints/content-iframe/root.tsx`)

- **Smooth scroll**: Uses `element.scrollIntoView({ behavior: "smooth", block: "center" })`
- **Interaction pause**: `onWheel` handler sets `isManualScroll` ref to true, clears after 2s debounced timeout
- **Toggle**: Per-video boolean in browser storage (defaults to `true`)
- **Threshold**: `abs(current - 0.5) < 0.3` (element center position relative to container, ~same idea as clientHeight/6)
- **Debounce helper**: `useDebouncedTimeout()` - reusable hook that clears previous timeout on each call

## Plan

### 1. Smooth scroll

Change `behavior: "auto"` to `behavior: "smooth"` in `virtualizer.scrollToIndex`.

`@tanstack/react-virtual`'s `scrollToIndex` supports `behavior: "smooth"`. The existing threshold check (clientHeight/6) prevents unnecessary re-scrolls when already near center, which should prevent conflicting smooth scroll animations.

### 2. Pause auto-scroll during user interaction (from v4)

Adopt v4's approach - simple and effective:

- `isManualScroll` ref, default `false`
- `onWheel` on scroll container: set `isManualScroll.current = true`, debounce reset to `false` after 2s
- In RAF loop: skip auto-scroll when `isManualScroll.current` is true
- On caption click (seek): reset `isManualScroll.current = false` (user re-engaged with playback)

Also handle touch: add `onTouchStart` with same logic (mobile users scroll by touch, not wheel).

### 3. Toggle to disable auto-scroll

- `useState` initialized from `localStorage` (key: `ytsub:auto-scroll`, default: `true`)
- Small icon button in the tab bar area (right side of Captions/Bookmarks tabs)
- Tooltip: "Auto-scroll", visually distinct when on vs off
- In RAF loop: skip auto-scroll when disabled

## Files to modify

- `src/routes/video-viewer.tsx` - all changes in this single file

## Implementation order

1. Add `useDebouncedTimeout` helper (bottom of file)
2. Add auto-scroll toggle state (localStorage-backed)
3. Add `isManualScroll` ref + `onWheel`/`onTouchStart` handlers
4. Update RAF loop to check both `autoScroll` and `!isManualScroll`
5. Change scroll behavior to `"smooth"`
6. Add toggle button UI in tab bar
7. Reset `isManualScroll` on caption click

## Status

- [ ] Plan approved
- [ ] Implementation started
- [ ] Complete
