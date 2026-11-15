# E2E Tests

The web app and extension e2e tests are two Playwright projects, `app` and `ext`, in `playwright.config.ts`. The subtitle extraction tests run against real YouTube pages with their own config, `playwright.youtube.config.ts`.

```sh
pnpm test-e2e                          # web app and extension
pnpm test-e2e e2e/ext/bookmarks.spec.ts # one file
pnpm test-e2e --project=app            # one project
E2E_SERVER=dev pnpm test-e2e           # against the dev server
pnpm test-youtube                      # real YouTube pages
```

`pnpm test-e2e` builds the extension into `dist/extension/`, then runs Playwright. Playwright builds the web app and serves it with `vite preview`, so the tests run the worker that ships. Set `E2E_SERVER=dev` to serve the web app with `pnpm dev` instead, which skips the web app build. Both servers persist local state to `.wrangler/state/e2e`, separate from the dev database.

## Choose Between `/dev` Routes and Auth-Gated Routes

The `/dev` routes render the shared UI with fixture data, so their tests need no server state. Open them with `page.goto("/dev/videos/...")` and don't call `login()` or `setupDb()`. These tests are fast and run in parallel.

Tests that hit `/`, `/videos/:id`, or the server APIs need a user in the database. Call `setupDb({ seed: true })` and then `login(page)`, because login needs the seed user. `setupDb()` writes to SQLite directly and takes about 0.15s.

Prefer `/dev` routes unless the feature needs the server.

## Write Tests

- Keep the structure flat. Don't nest `test.describe`, and call `setupDb()` and `login()` inline in each test.
- Prefer one rich flow test over several thin tests with one assertion each. Each test pays about 500ms of navigation, so combining related assertions saves real time.
- Wrap the body of a helper that performs several page actions in `test.step(name, fn, { box: true })`. Traces and the HTML report then show the helper as one named step, and a failure points at the spec line that called it.
- Scope selectors to a `data-testid` or a panel container, because text can repeat across the page. For example, the FAB text can match a tab button name. Prefer `getByTestId`, then `getByRole` scoped to a container, then page-wide `getByText`.

## Test the Extension

Extension tests load `dist/extension/`, which `pnpm test-e2e` builds, into a real Chromium instance. Running `pnpm exec playwright test` directly skips that build. They use their own fixtures in `e2e/ext/helper.ts`:

- The `test` fixture launches Chromium with `--load-extension` and provides `context`, `extensionId`, and `page`.
- `gotoBookmarks(page, extensionId)` opens `chrome-extension://<id>/bookmarks.html` with the test server URL.
- `seedChromeStorage(context, data)` seeds `chrome.storage.local` through the service worker.
- `login(page)` logs in through the extension bookmarks page. It is a different helper from the web app `login`.
- `openYouTubeTab(context, videoId)` opens a watch page and waits for the content script. `openPanelWithTracks(ytPage)` opens the caption panel with the ko and en tracks.

The tests never load the real youtube.com. The `context` fixture serves `https://www.youtube.com/**` from a route handler in `e2e/ext/youtube-mock.ts`. Chrome injects content scripts by URL, so the mocked watch page still gets them. The page has only what the content script reads, and the player API and caption tracks come from the fixtures in `scripts/youtube-json/<id>/`, so `videoId` must be one of those. Every other youtube.com request is aborted. `pnpm test-youtube` covers changes to the real page and API.

Push and pull sync go through a YouTube tab (tab RPC), so open one with `openYouTubeTab` before pushing or pulling. Without a YouTube tab, tests can only check the error toasts. To give push a session, create a bookmark in the content script panel rather than writing to IndexedDB. The bookmarks page then gets the video through the same path as in real use.

When a test opens a YouTube tab after the default `page`, call `page.bringToFront()` before using the bookmarks page, because clicks in a background tab can stall.

## Iterate on Failures

- Run `pnpm test-e2e -x` to stop at the first failure instead of waiting for the full suite.
- Read `test-results/report.json` to measure how a change affects test timing.

## Record Traces

Local runs record traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. CI runs with tracing off by default. Extension tests record traces too. The YouTube tests do not, because they use their own config.

## Record Traces on GitHub Actions

A same-repository PR that changes e2e specs traces those specs on each push. Find the trace link in the PR description. Changed specs under `e2e/youtube` are skipped.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=my-branch \
  -f tests='e2e/sync.spec.ts e2e/ext/bookmarks.spec.ts'
```

Separate test file filters with spaces. A filter can match specs in both the web app and extension projects. Add `-f grep='push'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
