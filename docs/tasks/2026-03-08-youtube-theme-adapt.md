# Adapt Extension to YouTube Dark/Light Theme

## Problem

The extension caption panel is hard-coded for YouTube's dark theme (`#0f0f0f` background, `#f1f1f1` text, etc.). When YouTube is in light mode, the dark panel looks out of place.

## Approach

YouTube signals dark mode via the `dark` attribute on `<html>`. We observe this attribute and toggle a class on the shadow host, then define both dark and light CSS variable sets.

### Files to Change

1. **`src/extension/content.css`** — Add `:host(.light)` block with light-mode color values matching YouTube's light theme
2. **`src/extension/content.tsx`** — Detect `html[dark]` attribute, observe changes via MutationObserver, toggle `.light`/`.dark` class on shadow host container
3. **`src/components/caption-panel.tsx`** — Replace hard-coded `#2563eb` / `#1a3a5c` in CaptionFab with CSS variable-based classes

### YouTube Theme Colors

**Dark** (existing — keep current values):

- Background: `#0f0f0f`, Foreground: `#f1f1f1`
- Muted: `#272727`, Muted foreground: `#aaa`
- Border: `#3f3f3f`, Ring: `#3ea6ff`

**Light** (new):

- Background: `#ffffff`, Foreground: `#0f0f0f`
- Muted: `#f2f2f2`, Muted foreground: `#606060`
- Border: `#e5e5e5`, Ring: `#065fd4`

### Detection Logic

```ts
function isYouTubeDark(): boolean {
  return document.documentElement.hasAttribute("dark");
}
```

Observe with MutationObserver on `document.documentElement` for attribute changes to `dark`.

## Implementation Steps

1. Add light-mode CSS variables under `:host(.light)` in content.css
2. Update `:host` to be `:host, :host(.dark)` (dark is default)
3. Add `color-scheme: light` in the light block
4. In content.tsx `inject()`, read initial theme and set class on shadow host's inner container or host element
5. Set up MutationObserver to watch for `dark` attr changes on `<html>`
6. Update CaptionFab to use theme-aware Tailwind classes instead of hard-coded hex

## Status

- [ ] Implementation in progress
