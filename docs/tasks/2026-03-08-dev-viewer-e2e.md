# E2E Tests for Extension via Dev-Viewer

## Problem

The extension shares its UI with the dev-viewer (`/dev/youtube/:videoId`) through shared components (`CaptionPanel`, `CaptionList`, `TrackPicker`). We can test these extension-facing features via Playwright against the dev-viewer without loading a Chrome extension.

Existing e2e tests cover the **app viewer** (bookmarks, tabs, API-backed captions). The dev-viewer exercises a different path: fixture-based JSON3 parsing, `mergeCaptions`, track picker with real multi-language data, and the FAB toggle — none of which have e2e coverage today.

## What's worth testing

### High value (extension-critical paths, easy to test)

1. **FAB toggle** — panel starts closed, click FAB opens it, click again closes
2. **Caption rendering** — panel shows merged dual-language captions from fixture data (confirms JSON3 parse → merge pipeline end-to-end)
3. **Track picker** — default languages (ko/en), switching languages reloads captions
4. **Caption row structure** — rows have timestamps, text1 (left), text2 (right)

### Medium value (feasible but needs YouTube iframe)

5. **Click-to-seek** — clicking a caption row calls `seekTo` on the player. Requires YouTube iframe to load, which is slow and network-dependent. Could mock `YTPlayer` but that defeats the point of e2e.
6. **Current caption highlight** — playing video highlights active row. Same iframe dependency.

### Not worth testing here

- **Auto-scroll** — timing-sensitive, flaky in CI, low bug surface
- **Bookmarking** — already covered by `bookmark-viewer.spec.ts` on the app viewer
- **Extension injection / Shadow DOM** — can't test via dev-viewer (need extension-specific tests)

## Approach

- New test file: `e2e/dev-viewer.spec.ts`
- No DB setup needed — dev-viewer uses fixture files, not API
- Login required (dev routes are behind `AuthLayout`)
- Focus on items 1–4 (no iframe dependency, deterministic)
- Items 5–6 can be added later if iframe proves reliable in CI

## Reference files

- `src/routes/dev-viewer.tsx` — dev-viewer page
- `src/components/caption-panel.tsx` — CaptionPanel + CaptionFab
- `src/components/caption-list.tsx` — CaptionList
- `src/components/track-picker.tsx` — TrackPicker
- `scripts/youtube-json/7GU_VQfgMT0/` — fixture data (ko, en, ja, es tracks)
- `e2e/bookmark-viewer.spec.ts` — existing test patterns
- `e2e/helper.ts` — `login()` helper

## Implementation plan

### `e2e/dev-viewer.spec.ts`

```ts
test.describe("dev-viewer caption panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/youtube/7GU_VQfgMT0");
  });

  // 1. FAB toggle
  test("FAB toggles caption panel open/closed", ...);

  // 2. Caption rendering
  test("panel shows caption rows after opening", ...);

  // 3. Track picker defaults
  test("defaults to ko/en language pair", ...);

  // 4. Language switching
  test("switching language reloads captions", ...);

  // 5. Caption row structure
  test("rows show timestamp, text1, text2 columns", ...);
});
```

### Key selectors (from existing components)

- FAB: button with Captions icon (lucide) — `getByRole("button")` with accessible name or test-id
- Caption rows: `[data-index='N']`
- Track picker: likely `<select>` or custom dropdown
- Timestamps: rendered as `m:ss` in caption-list

## Status

- **Done** — high-value tests implemented in `e2e/dev-viewer.spec.ts` (5 tests, all passing)
- **Remaining** — items 5–6 (click-to-seek, highlight) deferred until iframe reliability is assessed
