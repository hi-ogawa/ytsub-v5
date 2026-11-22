# E2E Tests

The web app tests in `e2e/` and the extension tests in `e2e/ext/` run in `playwright.config.ts`, split into two Playwright projects by whether they use the database: `db` and `no-db`. The subtitle extraction tests run against real YouTube pages with their own config, `playwright.youtube.config.ts`.

```sh
pnpm test-e2e                          # web app and extension
pnpm test-e2e e2e/sync.spec.ts         # one file
pnpm test-e2e --project=no-db          # one project
E2E_SERVER=dev pnpm test-e2e           # against the dev server
pnpm test-youtube                      # real YouTube pages
```

`pnpm test-e2e` builds the extension into `dist/extension/`, then runs Playwright. Playwright builds the web app and serves it with `vite preview`, so the tests run the worker that ships. Set `E2E_SERVER=dev` to serve the web app with `pnpm dev` instead, which skips the web app build. Both servers persist local state to `.wrangler/state/e2e`, separate from the dev database. The `db` project runs one test at a time, because its tests share that state and `setupDb()` clears it. The `no-db` project lists the extension specs that never call `setupDb()` and runs their tests in parallel alongside the `db` project, which shortens the run. `setupDb()` throws outside the `db` project, so a spec that needs the database fails until it is moved out of the `no-db` list.

## Choose Between the Extension and the Web App

[Architecture overview](architecture.md#share-one-ui-across-the-extension-and-the-web-app) lists what each surface can do, which decides where a test can run.

Test the caption panel and the bookmarks page in the extension tests, `e2e/ext`, because desktop users run them there and bookmarks are created there. These tests need no login or server state unless they sync, so add a new spec that doesn't sync to the `noDbSpecs` list in `playwright.config.ts`.

Test the web app for what only it does: login and registration, the server APIs, importing, and the viewer for pulled videos that phones use. These tests need a user in the database. Call `setupDb({ seed: true })` and then `login(page)`, because login needs the seed user. `setupDb()` writes to SQLite directly and takes about 0.15s. The web viewer shows only pulled videos, so `openPulledVideo(page, youtubeId)` logs in, pulls a seed video, and opens it.

The seed videos are the `import.json` files in `scripts/db-seed-json/<id>/`. To add one, build its `import.json` as the Zamak skill's [Generate import.json](../skills/zamak/references/generate-import-json.md) describes, put it there, and run `pnpm db:seed-gen`.

To check a UI change while working on it, run one spec on the surface that shows the change and open its trace, such as `pnpm test-e2e e2e/ext/caption-panel.spec.ts -g "<pattern>"` for the extension or `pnpm test-e2e e2e/basic.spec.ts -g "<pattern>"` for the web app.

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
- `createBookmarkAt(host, { index, start, end })` selects part of a caption inside the panel's shadow root and bookmarks it.

The tests never load the real youtube.com. The `context` fixture serves `https://www.youtube.com/**` from a route handler in `e2e/ext/youtube-mock.ts`. Chrome injects content scripts by URL, so the mocked watch page still gets them. The page has only what the content script reads, and the player API and caption tracks come from the fixtures in `scripts/youtube-json/<id>/`, so `videoId` must be one of those. Every other youtube.com request is aborted. `pnpm test-youtube` covers changes to the real page and API.

A push or pull test needs only the bookmarks page. To give push a session, create a bookmark in the content script panel rather than writing to IndexedDB, so the video reaches the bookmarks page through the same path as in real use. `seedVideoIndex(page, entries)` writes index entries alone, for tests about the list and its sync badges.

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
  -f tests='e2e/sync.spec.ts e2e/ext/bookmarks-page.spec.ts'
```

Separate test file filters with spaces. A filter can match specs in both the web app and the extension. Add `-f grep='push'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
