---
name: e2e-test
description: Writing or fixing Playwright e2e tests. Use when creating, debugging, or fixing flaky e2e tests.
---

# E2E Test Authoring (Playwright + React)

## Scope assertions to containers

`page.getByText()` matches anywhere — fragile and hard to debug. Scope to a specific container.

```ts
// Bad — ambiguous, unhelpful error on failure
await expect(page.getByText("to pinch")).toBeVisible();

// Good — scoped, failure message shows exactly where it looked
const popover = page.getByTestId("bookmark-popover");
await expect(popover.getByText("to pinch")).toBeVisible();
```

## Use `data-testid` for structural anchors

Add `data-testid` to key interactive regions (popovers, modals, panels, list items) in the component code. Use them as scoping containers in tests.

- Name by purpose: `bookmark-popover`, `caption-row`, `settings-panel`
- Don't over-apply — only on elements that serve as test anchors
- Prefer `data-testid` over CSS class selectors (`.border-highlight-border`) which break on style changes

## Hover in React: use `mouseover`, not `mouseenter`

`hover()`, `hover({ force: true })`, and `dispatchEvent("mouseenter")` fire native `mouseenter` which **doesn't bubble**. React's delegated event system at the root misses non-bubbling events.

```ts
// Bad — mouseenter doesn't bubble, React may not receive it
await el.hover({ force: true });
await el.dispatchEvent("mouseenter");

// Good — mouseover bubbles, React catches it reliably
await el.dispatchEvent("mouseover");
```

## Test structure

```ts
// 1. Locate container
const row = page.locator("[data-index='0']");

// 2. Find element within container
const highlight = row.getByTestId("bookmark-highlight").first();
await expect(highlight).toBeVisible();

// 3. Act
await highlight.dispatchEvent("mouseover");

// 4. Assert within the resulting UI region
const popover = page.getByTestId("bookmark-popover");
await expect(popover.getByText("translation")).toBeVisible();
```

## Fixing flaky tests

1. Identify the root cause (event bubbling, timing, element detachment) — don't just retry or increase timeouts
2. Verify fix with `pnpm test-e2e -- --grep "test name" --repeat-each 5`
3. Keep timeouts tight (2s default) — fix the test, don't raise the timeout

## Checklist when writing/modifying e2e tests

- [ ] Assertions scoped to a container, not bare `page.getByText()`
- [ ] Interactive regions have `data-testid` in component code
- [ ] Hover uses `dispatchEvent("mouseover")` for React components
- [ ] No CSS class selectors for finding elements
- [ ] Test passes with `--repeat-each 5`
