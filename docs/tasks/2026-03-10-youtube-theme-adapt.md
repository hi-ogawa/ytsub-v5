# Adapt extension to YouTube dark/light theme

## Problem

The extension caption panel is hard-coded to dark theme:

- `content.tsx` line 222: `container.classList.add("dark")`
- `content.css`: `:host { color-scheme: dark }`

YouTube supports light/dark modes and users can switch. The panel should match.

## Approach

YouTube signals dark mode via `<html dark>` attribute on the document element. We can:

1. Detect current theme: `document.documentElement.hasAttribute("dark")`
2. Watch for changes: `MutationObserver` on `<html>` `dark` attribute
3. Toggle `.dark` class on our shadow DOM container
4. Toggle `color-scheme` on the host element

## Reference files

- `src/extension/content.tsx` — injection logic, currently hard-codes `.dark`
- `src/extension/content.css` — hard-codes `color-scheme: dark` on `:host`
- `src/styles.css` — already has both light (`:root`) and dark (`.dark`) tokens

## Changes

### `content.css`

- Remove hard-coded `color-scheme: dark` from `:host`
- Add `.dark:host { color-scheme: dark }` (or handle via JS)

### `content.tsx`

- Create helper to detect YouTube dark mode: `isYouTubeDark()`
- On inject: set initial theme class
- Set up `MutationObserver` on `<html>` for `dark` attribute changes
- Toggle `.dark` on container + `color-scheme` on host
- Clean up observer on remove

### `CaptionFab` (caption-panel.tsx)

- FAB uses hard-coded dark colors (`bg-[#1a3a5c]`, `fill="#ffffff"`). Should use theme tokens.

## Status

- [x] Done — build passes, ready for manual testing on YouTube
