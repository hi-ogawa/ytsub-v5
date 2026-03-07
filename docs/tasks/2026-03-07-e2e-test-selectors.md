# E2E: Improve test selectors for debuggability

## Phase 1 — Replace CSS class selectors (done)

Bookmark highlight spans used Tailwind classes (`span.border-amber-400`, `span.border-sky-400`) as selectors. Replaced with `data-testid="highlight-manual"` / `data-testid="highlight-auto"`.

## Phase 2 — Broader selector cleanup

### Problem

Tests use opaque selectors and unscoped `getByText` assertions that are hard to debug when they fail:

**1. `data-index` / `data-side` are internal, not self-documenting**

```ts
// What is data-index='0'? A caption row? A list item?
page.locator("[data-index='0']");
// What is data-side='0'? Korean? Translation?
document.querySelector("[data-side='0']");
```

Used in: `bookmark-viewer.spec.ts` (lines 14, 37, 50, 86, 92, 106, 112–113, 153, 180, 187–188), `import.spec.ts` (lines 38, 58, 66), `basic.spec.ts` (line 51), `delete.spec.ts` (line 37)

**2. Unscoped `page.getByText()` + `toBeVisible()` — no context on failure**

```ts
// Fails with "expected text not found" — where was it looking?
await expect(page.getByText("to pinch")).toBeVisible();
// Could match anywhere: popover, bookmark list, caption text...
```

Used in: `bookmark-viewer.spec.ts` (lines 31–32, 44–45, 56, 66–70, 89, 146, 164), `import.spec.ts` (lines 23, 28–30, 62, 70)

**3. CSS class selectors for structure**

```ts
// Fragile — depends on Tailwind classes
.locator("div.flex.cursor-pointer")   // delete.spec.ts:43
.locator("[role=dialog], .fixed")      // import.spec.ts:34, 54
```

**4. `toHaveClass(/font-medium/)` for active tab state**

```ts
// Tests styling detail instead of semantic state
await expect(page.getByRole("button", { name: /Bookmarks/ })).toHaveClass(
  /font-medium/,
);
```

Used in: `bookmark-viewer.spec.ts` (lines 161, 177)

### Proposed testid additions

| Component                        | Current selector               | Proposed `data-testid`                                        |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Caption row                      | `[data-index='N']`             | `caption-row` (keep `data-index` for virtualizer, add testid) |
| Caption text1 (Korean) side      | `[data-side='0']`              | `caption-text1`                                               |
| Caption text2 (translation) side | `[data-side='1']`              | `caption-text2`                                               |
| Bookmark popover                 | `.absolute.z-10...` (implicit) | `bookmark-popover`                                            |
| Bookmark list item               | `div.flex.cursor-pointer`      | `bookmark-item`                                               |
| Import dialog                    | `[role=dialog], .fixed`        | `import-dialog`                                               |

### Proposed assertion style

```ts
// before — opaque
const row = page.locator("[data-index='0']");
await highlight.first().hover({ force: true });
await expect(page.getByText("to pinch")).toBeVisible();

// after — self-documenting, scoped
const row = page.getByTestId("caption-row").nth(0);
await highlight.first().hover({ force: true });
const popover = page.getByTestId("bookmark-popover");
await expect(popover.getByText("to pinch")).toBeVisible();
```

For active tab state, use `aria-selected` or `data-active` instead of checking CSS classes.

### Implementation steps

1. Add `data-testid` attributes to components listed above
2. Update E2E selectors to use `getByTestId` with scoped assertions
3. Keep `data-index` / `data-side` / `data-offset` — they serve runtime purposes (virtualizer, bookmark selection logic)
4. `pnpm build && pnpm test-e2e`

## Status

- [x] Phase 1: highlight spans (`highlight-manual` / `highlight-auto`)
- [ ] Phase 2: broader selector cleanup
