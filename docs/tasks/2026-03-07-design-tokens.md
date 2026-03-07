# Design Tokens: Color

## Problem

Colors are hardcoded as raw Tailwind classes (`text-gray-500`, `bg-black`, etc.) throughout the codebase. This causes:

- **No single source of truth** — changing a color means grepping and updating every instance
- **Ambiguous intent** — is `text-gray-500` muted text or something else? Is `text-gray-400` intentionally different from `text-gray-500`?
- **Inconsistency** — similar UI elements use slightly different shades (e.g., `text-gray-600` vs `text-gray-500` for secondary text)

## Approach

Follow **shadcn/ui's convention**: define semantic color tokens as CSS custom properties in `:root` (and `.dark` for future dark mode), then bridge them into Tailwind v4 via `@theme inline`.

**shadcn convention (verified):**

- Tokens defined as bare oklch values in `:root` / `.dark`
- Naming: `--{role}` for backgrounds, `--{role}-foreground` for text on that background
- Standard roles: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`
- Bridged into Tailwind v4 with `@theme inline { --color-primary: var(--primary); ... }`
- Produces clean utility classes: `bg-primary`, `text-primary-foreground`, `border-border`

No new dependencies. No component abstractions (separate effort).

## Naming Convention

Adopt shadcn's `{role}` / `{role}-foreground` pattern. This gives flat, clean class names:

- `bg-primary` / `text-primary-foreground` (not `bg-bg-primary` / `text-text-muted`)
- `bg-muted` / `text-muted-foreground`
- `bg-accent` / `text-accent-foreground`

Where we need tokens shadcn doesn't define (bookmark highlights), we extend with the same pattern.

## Current Color Audit

### Text colors

| Raw class       | Where                            | Proposed token                        |
| --------------- | -------------------------------- | ------------------------------------- |
| `text-white`    | buttons, active tabs             | `text-primary-foreground`             |
| `text-gray-800` | popover label                    | `text-foreground`                     |
| `text-gray-700` | nav links                        | `text-foreground`                     |
| `text-gray-600` | secondary info, notes            | `text-muted-foreground`               |
| `text-gray-500` | timestamps, counts, placeholders | `text-muted-foreground`               |
| `text-gray-400` | tertiary info, timestamps        | `text-muted-foreground` (consolidate) |
| `text-gray-300` | icon default state               | `text-muted-foreground` (consolidate) |
| `text-red-600`  | error messages                   | `text-destructive`                    |
| `text-red-500`  | error states                     | `text-destructive`                    |
| `text-blue-600` | links                            | `text-accent-foreground`              |
| `text-blue-500` | clickable text                   | `text-accent-foreground`              |
| `text-sky-600`  | bookmark badge text              | `text-accent-foreground`              |

### Background colors

| Raw class     | Where                          | Proposed token                                            |
| ------------- | ------------------------------ | --------------------------------------------------------- |
| `bg-white`    | cards, panels, dialogs         | `bg-card` / `bg-popover`                                  |
| `bg-gray-50`  | hover states, subtle bg        | `bg-muted`                                                |
| `bg-gray-100` | badges, hover states           | `bg-muted`                                                |
| `bg-gray-200` | active bg                      | `bg-muted` (consolidate)                                  |
| `bg-gray-300` | disabled/placeholder           | (keep raw — rare)                                         |
| `bg-black`    | primary buttons                | `bg-primary`                                              |
| `bg-gray-800` | primary button hover           | (keep as `hover:bg-gray-800` or define `--primary-hover`) |
| `bg-black/40` | dialog overlay                 | `bg-overlay` (custom)                                     |
| `bg-blue-500` | save button                    | `bg-accent`                                               |
| `bg-blue-600` | save button hover              | (keep as hover variant)                                   |
| `bg-red-50`   | delete hover                   | `bg-destructive-subtle` (custom)                          |
| `bg-sky-50`   | highlight bg (current caption) | `bg-highlight` (custom)                                   |
| `bg-sky-100`  | badge bg                       | `bg-highlight` (custom, consolidate)                      |
| `bg-amber-50` | alt highlight (translation)    | `bg-highlight-alt` (custom)                               |
| `bg-blue-50`  | flash highlight                | `bg-highlight` (custom, consolidate)                      |

### Border colors

| Raw class          | Where                     | Proposed token                  |
| ------------------ | ------------------------- | ------------------------------- |
| `border-gray-200`  | cards, panels, list items | `border-border`                 |
| `border-gray-300`  | dashed upload border      | `border-border`                 |
| `border-blue-500`  | active tab indicator      | `border-ring`                   |
| `border-blue-400`  | flash highlight           | `border-ring`                   |
| `border-sky-400`   | highlight border          | `border-ring`                   |
| `border-amber-400` | alt highlight border      | `border-highlight-alt` (custom) |

### Ring / focus

| Raw class       | Where      | Proposed token |
| --------------- | ---------- | -------------- |
| `ring-blue-300` | focus ring | `ring-ring`    |

### Hardcoded hex (styles.css keyframe)

| Value     | Proposed           |
| --------- | ------------------ |
| `#60a5fa` | `var(--ring)`      |
| `#eff6ff` | `var(--highlight)` |

## Token Definitions

### `:root` (light mode)

```css
:root {
  /* Page */
  --background: oklch(1 0 0); /* white */
  --foreground: oklch(0.274 0 0); /* gray-800 */

  /* Cards & popovers */
  --card: oklch(1 0 0); /* white */
  --card-foreground: oklch(0.274 0 0); /* gray-800 */
  --popover: oklch(1 0 0); /* white */
  --popover-foreground: oklch(0.274 0 0);

  /* Primary (buttons) */
  --primary: oklch(0 0 0); /* black */
  --primary-foreground: oklch(1 0 0); /* white */

  /* Muted (subtle bg, dimmed text) */
  --muted: oklch(0.968 0 0); /* ~gray-50/100 */
  --muted-foreground: oklch(0.556 0 0); /* ~gray-500 */

  /* Accent (blue interactive elements) */
  --accent: oklch(0.623 0.214 259); /* ~blue-500 */
  --accent-foreground: oklch(1 0 0); /* white */

  /* Destructive (errors, danger) */
  --destructive: oklch(0.577 0.245 27); /* ~red-600 */
  --destructive-foreground: oklch(1 0 0);
  --destructive-subtle: oklch(0.971 0.013 17); /* ~red-50 */

  /* Borders & rings */
  --border: oklch(0.922 0 0); /* ~gray-200 */
  --input: oklch(0.922 0 0);
  --ring: oklch(0.623 0.214 259); /* ~blue-500 */

  /* Overlay */
  --overlay: oklch(0 0 0 / 40%);

  /* Custom: highlights (not in shadcn) */
  --highlight: oklch(0.951 0.026 237); /* ~sky-50 */
  --highlight-alt: oklch(0.962 0.059 95); /* ~amber-50 */
  --highlight-alt-border: oklch(0.745 0.16 82); /* ~amber-400 */
}
```

### `.dark` (future)

Same variable names, inverted lightness values. Define when dark mode is implemented.

### `@theme inline` bridge

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-subtle: var(--destructive-subtle);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-overlay: var(--overlay);
  --color-highlight: var(--highlight);
  --color-highlight-alt: var(--highlight-alt);
  --color-highlight-alt-border: var(--highlight-alt-border);
}
```

This produces utility classes like `bg-primary`, `text-muted-foreground`, `border-border`, `bg-highlight`, etc.

## Consolidation Decisions

1. **Grays → 2 tiers**: `foreground` (gray-700/800) and `muted-foreground` (gray-300 through gray-600). The 4-way gray split (300/400/500/600) is not intentional — consolidate to one `muted-foreground` value.
2. **Reds → 1 token**: `red-500` and `red-600` both mean error → `destructive`.
3. **Blues → 1 token**: `blue-500` and `blue-600` both mean interactive → `accent`.
4. **Highlights → 2 tokens**: `highlight` (sky/blue tones for current caption, badges) and `highlight-alt` (amber for translation side).

## Implementation Steps

1. Add `:root` variables and `@theme inline` bridge in `src/styles.css`
2. Replace raw color classes in `src/routes/login.tsx` (smallest file, good test)
3. Replace in `src/app.tsx`
4. Replace in `src/routes/video-list.tsx`
5. Replace in `src/routes/video-viewer.tsx` (largest file)
6. Replace hardcoded hex in `styles.css` keyframe with `var(--ring)` / `var(--highlight)`
7. `pnpm build` to verify
8. Visual check with `pnpm dev`

## Dark Mode (future)

The `:root` / `.dark` pattern makes dark mode straightforward later:

- Add `.dark { ... }` block with inverted values
- Toggle `.dark` class on `<html>` element
- All components automatically update — no code changes needed

## Reference

- [shadcn/ui theming docs](https://ui.shadcn.com/docs/theming)
- shadcn uses oklch color space for perceptual uniformity
- Tailwind v4 `@theme inline` prevents Tailwind from generating utility classes for every possible shade — only our tokens get classes

## E2E Test Selectors to Update

5 selectors in E2E tests target raw Tailwind color classes and must be updated:

| File                          | Line | Current selector        | New selector                       |
| ----------------------------- | ---- | ----------------------- | ---------------------------------- |
| `e2e/bookmark-viewer.spec.ts` | 38   | `span.border-amber-400` | `span.border-highlight-alt-border` |
| `e2e/bookmark-viewer.spec.ts` | 51   | `span.border-amber-400` | `span.border-highlight-alt-border` |
| `e2e/bookmark-viewer.spec.ts` | 138  | `span.border-sky-400`   | `span.border-ring`                 |
| `e2e/bookmark-viewer.spec.ts` | 152  | `span.border-amber-400` | `span.border-highlight-alt-border` |
| `e2e/import.spec.ts`          | 68   | `span.border-amber-400` | `span.border-highlight-alt-border` |

Include as part of implementation step 5 (video-viewer.tsx) since those are the bookmark highlight spans.

## Status (design tokens)

- [x] Color audit complete
- [x] shadcn convention researched
- [x] Token mapping proposed
- [x] E2E selector impact reviewed
- [x] Consolidation decisions confirmed
- [x] Implementation complete
- [x] Build passes, zero raw color classes remaining in src/

---

## Phase 2: Dark Mode

### Current state

Tokens are defined directly in `@theme inline` using Tailwind var references (`var(--color-gray-800)`, etc.). This works for light mode but **doesn't support dark mode** — `@theme inline` values can't be conditionally overridden by a `.dark` class.

### Approach: split into `:root` / `.dark` + `@theme inline` bridge

Restructure `styles.css` into the shadcn pattern we originally planned:

1. **`:root`** — define raw color values for light mode
2. **`.dark`** — override the same variables with dark values
3. **`@theme inline`** — bridge `:root` vars into Tailwind (unchanged across modes)

```css
:root {
  --background: var(--color-white);
  --foreground: var(--color-gray-800);
  --primary: var(--color-black);
  --primary-hover: var(--color-gray-800);
  /* ... */
}

.dark {
  --background: var(--color-gray-950);
  --foreground: var(--color-gray-100);
  --primary: var(--color-white);
  --primary-hover: var(--color-gray-200);
  /* ... */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  /* ... */
}
```

### Dark palette (proposed)

| Token                  | Light     | Dark      |
| ---------------------- | --------- | --------- |
| `background`           | white     | gray-950  |
| `foreground`           | gray-800  | gray-100  |
| `card`                 | white     | gray-900  |
| `card-foreground`      | gray-800  | gray-100  |
| `popover`              | white     | gray-900  |
| `popover-foreground`   | gray-800  | gray-100  |
| `primary`              | black     | white     |
| `primary-hover`        | gray-800  | gray-200  |
| `primary-foreground`   | white     | black     |
| `muted`                | gray-100  | gray-800  |
| `muted-foreground`     | gray-500  | gray-400  |
| `accent`               | blue-500  | blue-400  |
| `accent-foreground`    | white     | white     |
| `destructive`          | red-600   | red-400   |
| `destructive-subtle`   | red-50    | red-950   |
| `border`               | gray-200  | gray-800  |
| `input`                | gray-200  | gray-800  |
| `ring`                 | blue-500  | blue-400  |
| `overlay`              | black/40% | black/60% |
| `highlight`            | sky-100   | sky-900   |
| `highlight-bg`         | sky-100   | sky-950   |
| `highlight-border`     | sky-400   | sky-500   |
| `highlight-foreground` | sky-600   | sky-300   |
| `highlight-alt-bg`     | amber-100 | amber-950 |
| `highlight-alt-border` | amber-400 | amber-500 |

### Toggle mechanism

- Add a toggle button in `HeaderMenu` (app.tsx)
- Toggle `.dark` class on `<html>` element
- Persist preference in `localStorage` (key: `ytsub:theme`)
- Default: follow system preference via `prefers-color-scheme`
- Apply before React hydration to avoid flash (inline script in `index.html` or early body script)

### Implementation steps

1. Restructure `styles.css`: `:root` + `.dark` + `@theme inline` bridge
2. Add `.dark` values (see palette above)
3. Add `bg-background text-foreground` to `<body>` or root `<div>` in `app.tsx`
4. Add theme toggle to `HeaderMenu`
5. Add anti-flash script in `index.html`
6. `pnpm build` to verify
7. Visual check light + dark with `pnpm dev`
8. E2E tests — no selector changes expected (tokens unchanged)

### E2E impact

None expected — selectors target semantic token class names which don't change between modes.

### Feedback

- Three-way toggle: dark / light / system (not just dark/light binary). "System" should follow `prefers-color-scheme` and be the default when no explicit choice is stored.
- Prevent CSS transitions/animations during theme toggle — add a temporary class that disables all transitions (e.g. `document.documentElement.classList.add('no-transitions')`, flush layout, then remove) to avoid flickering colors mid-switch.

### Status (dark mode)

- [x] Plan confirmed
- [x] Initial implementation
- [ ] Three-way toggle (dark / light / system)
- [ ] Disable transitions during toggle
