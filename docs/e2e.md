# E2E Traces

Local runs record traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. CI runs with tracing off by default.

```sh
pnpm test-e2e e2e/sync.spec.ts
```

Extension specs trace the same way. Build the extension first, because they load `dist/extension`.

```sh
pnpm build-ext
pnpm test-e2e-ext
```

The YouTube extraction specs under `e2e/youtube` use their own config and do not record traces.

## E2E Traces on GitHub Actions

Add the `e2e-trace` label to a same-repository PR to trace changed E2E specs on each push. Find the trace link in the PR description. Remove the label to stop automatic runs.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=my-branch \
  -f tests='e2e/sync.spec.ts e2e/ext/bookmarks.spec.ts'
```

Separate test file filters with spaces. A filter can match specs in both the `app` and `ext` projects. Add `-f grep='push'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
