# E2E: Replace CSS class selectors with data-testid

## Problem

E2E tests select bookmark highlight spans by Tailwind class names (`span.border-amber-400`, `span.border-sky-400`). These break whenever styling changes — e.g., the design token migration in `docs/tasks/2026-03-07-design-tokens.md`.

CSS classes describe **how it looks**. Tests should select by **what it is**.

## Approach

Add `data-testid` attributes to highlight spans in the viewer component, then update E2E selectors to use them.

## Current selectors

| File                          | Line | Selector                | What it means                        |
| ----------------------------- | ---- | ----------------------- | ------------------------------------ |
| `e2e/bookmark-viewer.spec.ts` | 38   | `span.border-amber-400` | highlighted text2 (translation) span |
| `e2e/bookmark-viewer.spec.ts` | 51   | `span.border-amber-400` | highlighted text2 span               |
| `e2e/bookmark-viewer.spec.ts` | 138  | `span.border-sky-400`   | highlighted text1 (Korean) span      |
| `e2e/bookmark-viewer.spec.ts` | 152  | `span.border-amber-400` | highlighted text2 span               |
| `e2e/import.spec.ts`          | 68   | `span.border-amber-400` | highlighted text2 span               |

## Proposed change

In the viewer component, add `data-testid` to highlight spans:

```tsx
// text1 (Korean) highlight
<span data-testid="highlight-text1" className="...">word</span>

// text2 (translation) highlight
<span data-testid="highlight-text2" className="...">word</span>
```

In E2E tests:

```ts
// before
row.locator("span.border-amber-400");

// after
row.locator('[data-testid="highlight-text2"]');
```

## Implementation steps

1. Find where highlight spans are rendered in `src/routes/video-viewer.tsx`
2. Add `data-testid="highlight-text1"` / `data-testid="highlight-text2"` to the respective spans
3. Update 5 selectors across `e2e/bookmark-viewer.spec.ts` and `e2e/import.spec.ts`
4. `pnpm build` to verify
5. `pnpm test-e2e` to verify tests pass

## Sequencing

Do this **after** the design token migration — that PR will update the selectors to token class names as an intermediate step. This follow-up replaces them with `data-testid` so future styling changes never break tests again.

## Status

- [x] Implementation — used `highlight-manual` / `highlight-auto` (matches bookmark status semantics)
