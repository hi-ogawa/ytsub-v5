# Extension: Hidable Captions Panel with FAB

## Problem

The captions panel is always visible on YouTube watch pages. There's no way to hide it — it covers part of the video area and can't be dismissed. Users need a way to toggle the panel on/off.

## Approach

Add a **FAB (Floating Action Button)** at the bottom-right corner of the page. The panel starts **closed by default**. Clicking the FAB toggles the panel open/closed.

Both the FAB and the panel live inside the same Shadow DOM host to keep style isolation simple.

## Reference

- `src/extension/content.tsx` — injection logic, `ExtensionViewer` component
- `src/extension/content.css` — extension theme/styles

## Design

- **FAB**: Fixed position, bottom-right (e.g. `bottom: 20px, right: 20px`), small circular button with a captions icon (e.g. `CC` text or subtitle icon via inline SVG)
- **Panel**: Same as today but only rendered when open
- **Default state**: Closed (FAB only visible)
- **Persist preference**: Not needed for now — resets to closed on each page load

## Implementation Steps

1. **Restructure `inject()`** — instead of creating the panel host directly, create a lighter host that renders a root `<App>` component managing both FAB and panel
2. **Add `App` component** with `open` state (default `false`):
   - When closed: render only the FAB button
   - When open: render the FAB + the panel
3. **FAB styling**:
   - Fixed position within the Shadow DOM host
   - `bottom: 20px, right: 20px` (absolute within the host, which is fixed to viewport)
   - Circular, ~48px, background `--ring` color (#3ea6ff), white icon
   - Z-index above the panel
4. **Adjust host element styles**:
   - When closed: host should not block page interaction (no large fixed overlay). Options:
     - Make host cover only the FAB area (`pointer-events: none` on host, `pointer-events: auto` on FAB)
     - Or: keep host full-coverage but with `pointer-events: none`, add `pointer-events: auto` on FAB and panel
   - When open: panel and FAB both interactive
5. **Verify**: Build with `pnpm build-ext`, check `pnpm tsc && pnpm lint`

## Key Decisions

- **Host element strategy**: Use `pointer-events: none` on the host div so it doesn't block YouTube page clicks, then `pointer-events: auto` on the FAB and panel. This lets us keep a single host element regardless of open/closed state.
- **FAB position**: Bottom-right to stay out of the way of YouTube's top-right profile/notifications area (also addresses the adjacent PRD item about not covering the profile popover).

## Status

- [x] Done
