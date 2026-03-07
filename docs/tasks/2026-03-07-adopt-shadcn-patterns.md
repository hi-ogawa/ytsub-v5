# Adopt shadcn/ui component patterns

Relates to: `refactor: adopt component library` in prd.md

## Problem

Interactive components (dialog, dropdown, popover, tabs) are hand-rolled with accessibility gaps:

- **HeaderMenu** (`src/app.tsx`): basic blur-to-close, no keyboard nav or escape handling
- **ImportDialog** (`src/routes/video-list.tsx`): hand-rolled overlay, no focus trap, no scroll lock
- **BookmarkWord popover** (`src/routes/video-viewer.tsx`): manual positioning, ad-hoc hover/delay logic
- **Tab bar** (`src/routes/video-viewer.tsx`): no aria roles, no keyboard arrow switching

## Approach

Use shadcn/ui source as a **pattern reference** (not a dependency). Read their component source in `docs/skills/ui/references/shadcn/apps/v4/registry/new-york-v4/ui/`, extract accessibility and interaction patterns, reimplement with our design tokens and styling.

See `docs/skills/ui/SKILL.md` for the full workflow.

## Scope

### Phase 1 — High-impact components

| Component     | Reference file      | Current location                | Key improvements                                             |
| ------------- | ------------------- | ------------------------------- | ------------------------------------------------------------ |
| Dialog        | `dialog.tsx`        | `video-list.tsx` ImportDialog   | Focus trap, escape-to-close, scroll lock, proper aria roles  |
| Dropdown menu | `dropdown-menu.tsx` | `app.tsx` HeaderMenu            | Keyboard nav (arrow keys), escape, focus trap, aria-expanded |
| Popover       | `popover.tsx`       | `video-viewer.tsx` BookmarkWord | Formalized positioning, dismiss behavior, aria attributes    |

### Phase 2 — Nice to have

| Component    | Reference file     | Current location           | Key improvements                                              |
| ------------ | ------------------ | -------------------------- | ------------------------------------------------------------- |
| Tabs         | `tabs.tsx`         | `video-viewer.tsx` tab bar | role="tablist"/role="tab", aria-selected, arrow-key switching |
| Alert dialog | `alert-dialog.tsx` | `window.confirm()` calls   | Styled confirmation dialogs (replaces native browser confirm) |

### Out of scope

Buttons, inputs, forms, badges — too simple to benefit.

## Implementation notes

- One component at a time, each as a separate commit
- Extract shared primitives if patterns repeat (e.g. focus trap hook, click-outside hook)
- Do NOT add Radix, cva, or any shadcn dependency
- Prefer native HTML where possible (`<dialog>` element for modals)
- Keep existing visual design — this is an a11y/interaction refactor, not a redesign

## Reference files to read before starting

- `docs/skills/ui/SKILL.md` — workflow for using shadcn as reference
- `src/app.tsx` — HeaderMenu dropdown
- `src/routes/video-list.tsx` — ImportDialog
- `src/routes/video-viewer.tsx` — BookmarkWord popover, tab bar
- `src/styles.css` — design tokens

## Status

- **Planning** — awaiting feedback
