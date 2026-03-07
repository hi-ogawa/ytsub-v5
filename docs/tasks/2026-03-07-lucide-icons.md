# Replace hand-written SVGs with lucide-react

## Problem

Icons are hand-written SVG paths inlined in components. Hard to read, error-prone, and inconsistent (mix of Heroicons 20px filled and 24px outline styles).

## Approach

Install `lucide-react` (what shadcn uses) and replace all inline SVGs with named icon imports. Lucide tree-shakes per icon, so bundle impact is minimal.

## Inventory

### `src/routes/root.tsx`

| Line | Current SVG                        | Lucide replacement       |
| ---- | ---------------------------------- | ------------------------ |
| 115  | ThemeIcon (sun/moon/monitor paths) | `Sun`, `Moon`, `Monitor` |
| 158  | Vertical dots (menu trigger)       | `EllipsisVertical`       |

### `src/routes/video-viewer.tsx`

| Line | Current SVG                   | Lucide replacement                        |
| ---- | ----------------------------- | ----------------------------------------- |
| 420  | External link (popover go-to) | `ExternalLink` or `SquareArrowOutUpRight` |
| 820  | Down arrow (auto-scroll)      | `ArrowDown`                               |
| 835  | Chevron left (prev bookmark)  | `ChevronLeft`                             |
| 852  | Chevron right (next bookmark) | `ChevronRight`                            |
| 999  | X close (FAB dismiss)         | `X`                                       |
| 1010 | Spinner circle                | `Loader2` (has animate-spin convention)   |
| 1030 | Bookmark filled               | `Bookmark`                                |

### `src/routes/video-list.tsx`

| Line | Current SVG     | Lucide replacement |
| ---- | --------------- | ------------------ |
| 243  | X delete button | `X`                |

## Steps

1. `pnpm add lucide-react`
2. Replace SVGs in `root.tsx`
3. Replace SVGs in `video-viewer.tsx`
4. Replace SVGs in `video-list.tsx`
5. Run E2E tests (icons are cosmetic but some tests click by role/position)

## Notes

- Lucide default size is 24px. Use `size={16}` for h-4 w-4, `size={20}` for h-5 w-5, etc.
- Lucide uses `stroke` style by default — some current icons use `fill`. Check visual parity.
- `className` prop works for sizing/color.

## Status

- **Planning** — awaiting feedback
