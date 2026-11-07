# E2E Tests

The web app and extension e2e tests are two Playwright projects in `playwright.config.ts`. The subtitle extraction tests run against real YouTube pages with their own config, `playwright.youtube.config.ts`.

```sh
pnpm test-e2e              # web app
pnpm build-ext             # build dist/extension/ before extension tests
pnpm test-e2e-ext          # extension
pnpm test-youtube          # real YouTube pages
```

## Choose Between `/dev` Routes and Auth-Gated Routes

The `/dev` routes render the shared UI with fixture data, so their tests need no server state. Open them with `page.goto("/dev/videos/...")` and don't call `login()` or `setupDb()`. These tests are fast and run in parallel.

Tests that hit `/`, `/videos/:id`, or the server APIs need a user in the database. Call `setupDb({ seed: true })` and then `login(page)`, because login needs the seed user. `setupDb()` writes to SQLite directly and takes about 0.15s.

Prefer `/dev` routes unless the feature needs the server.

## Write Tests

- Keep the structure flat. Don't nest `test.describe`, and call `setupDb()` and `login()` inline in each test.
- Prefer one rich flow test over several thin tests with one assertion each. Each test pays about 500ms of navigation, so combining related assertions saves real time.
- Scope selectors to a `data-testid` or a panel container, because text can repeat across the page. For example, the FAB text can match a tab button name. Prefer `getByTestId`, then `getByRole` scoped to a container, then page-wide `getByText`.

## Test the Extension

Extension tests load `dist/extension/` into a real Chromium instance, so run `pnpm build-ext` first. They use their own fixtures in `e2e/ext/helper.ts`:

- The `test` fixture launches Chromium with `--load-extension` and provides `context`, `extensionId`, and `page`.
- `gotoBookmarks(page, extensionId)` opens `chrome-extension://<id>/bookmarks.html` with the test server URL.
- `seedChromeStorage(context, data)` seeds `chrome.storage.local` through the service worker.
- `login(page)` logs in through the extension bookmarks page. It is a different helper from the web app `login`.

Push and pull sync go through a YouTube tab (tab RPC). Without a YouTube tab, tests can only check the error toasts.

## Iterate on Failures

- Run `pnpm test-e2e -x` to stop at the first failure instead of waiting for the full suite.
- Read `test-results/report.json` to measure how a change affects test timing.

## Record Traces

Local runs record traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. CI runs with tracing off by default. Extension tests record traces too. The YouTube tests do not, because they use their own config.

## Record Traces on GitHub Actions

Add the `e2e-trace` label to a same-repository PR to trace changed e2e specs on each push. Find the trace link in the PR description. Remove the label to stop automatic runs. Changed specs under `e2e/youtube` are skipped.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=my-branch \
  -f tests='e2e/sync.spec.ts e2e/ext/bookmarks.spec.ts'
```

Separate test file filters with spaces. A filter can match specs in both the web app and extension projects. Add `-f grep='push'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
