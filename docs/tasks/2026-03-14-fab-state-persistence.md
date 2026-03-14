# Persist FAB open/close state per video

## Problem

FAB defaults to closed (`useState(false)`) on every page load / YouTube SPA navigation. If the user had the panel open on a video, navigating away and back resets it to closed. This is annoying when switching between videos.

## Approach

Use `localStorage` with a per-video key, matching the existing pattern for track selection (`"zamak:selected-tracks:${videoId}"` in `caption-session.ts`).

**Key:** `"zamak:fab-open:${videoId}"` — stores `true`/`false`.

### Why not `createLocalStorageStore`?

That utility creates a store with a **fixed** key at module scope. Per-video state needs a dynamic key based on the current `videoId`, so direct `localStorage` access is simpler (same pattern as track selection).

## Files to change

1. **`src/extension/content.tsx`** (line 37) — Replace `useState(false)` with initial value read from localStorage. Persist on toggle.
2. **`src/routes/dev-viewer.tsx`** (line 26) — Same change for dev-viewer consistency.

## Implementation

### In `content.tsx`

```tsx
// Replace:
const [open, setOpen] = useState(false);

// With:
const [open, setOpen] = useState(() => {
  try {
    return localStorage.getItem(`zamak:fab-open:${videoId}`) === "true";
  } catch {
    return false;
  }
});

const toggleOpen = () => {
  setOpen((prev) => {
    const next = !prev;
    try {
      localStorage.setItem(`zamak:fab-open:${videoId}`, String(next));
    } catch {}
    return next;
  });
};
```

Then update the `CaptionFab` onClick to use `toggleOpen` instead of the inline arrow.

### In `dev-viewer.tsx`

Same pattern using the route `videoId` param.

## Considerations

- **Storage cleanup**: Not needed. These are tiny boolean values. Even 1000 videos = ~30KB. localStorage limit is 5MB+.
- **Default closed**: If no stored value exists, defaults to `false` (closed) — same as current behavior.
- **Shadow DOM**: `localStorage` is accessible from within shadow DOM (it's on `window`), so no issues in the extension context.

## Status

- [ ] Implementation
- [ ] `pnpm tsc && pnpm lint`
- [ ] `pnpm build`

## Feedback log
