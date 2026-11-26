# Agent Guide

## Quick Reference

| Command                 | What it does                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm tsc && pnpm lint` | Type checks, then formats .ts, .tsx, .md, and .json and lints .ts and .tsx. The check for a change |
| `pnpm build`            | Builds the web app                                                                                 |
| `pnpm test`             | Runs the unit tests in `src/` with vitest                                                          |
| `pnpm test-e2e`         | Runs the web app and extension e2e tests, which CI runs in full                                    |
| `pnpm build-ext`        | Builds the Chrome extension                                                                        |
| `pnpm test-youtube`     | Runs the subtitle extraction tests against real YouTube pages                                      |

## Key Docs

The [product overview](docs/product.md) and the [architecture overview](docs/architecture.md) describe what the app does and how it is built, including its UI surfaces, and are the starting point for feature work. The web app also serves the bookmarks page and the viewer at `/_preview` with static client-only data, so UI can be developed and reviewed on any build without a server, data, or login. [Extension runtime](docs/extension-runtime.md) and [data and sync](docs/data-and-sync.md) cover extension messaging and storage. [docs/README.md](docs/README.md) indexes the rest of the docs.

## Conventions

- Commit messages follow Conventional Commits without a scope (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- History is never rewritten. A branch picks up `origin/main` by merging it, not by rebasing, amending, or force pushing.
- Long-running tasks such as dev servers and watch modes don't fit an agent session, so code is verified with `pnpm build` rather than `pnpm dev`.
- pnpm passes arguments to scripts without `--`, and a `--` silently breaks filtering, so commands read `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"`.
- `.ts` scripts run with `node`, which strips TypeScript natively, so `tsx` and `ts-node` aren't used.
- File names are kebab-case.
- Each build target has its own folder under `src/` (`web/`, `extension/`, `server/`), and code they share sits at the top level of `src/`.
- `src/utils/` holds code that knows nothing about the app, so it imports nothing else from `src/`. App logic lives in `src/lib/`.
- Variable names are full words, such as `bookmark` rather than `bm` and `event` rather than `e`. A one-letter name appears only as the parameter of a one-expression callback, where the collection names it. Terms the code base or its ecosystem uses as words, such as `id`, `url`, `db`, and `props`, count as full words.
- Function names start with a verb for the action the function performs, so a call site reads as what happens rather than what comes back. That includes class accessors, which are `get`-prefixed methods rather than getters. Components, hooks, and other constructs with their own ecosystem naming conventions follow those conventions.
- The code has no compatibility paths or handling for edge cases that don't occur in practice.
- Code is organized so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. A chunk is split where the needed expertise changes, even with one caller, and kept together when it shares one domain, regardless of length.
- Functions are ordered by reading flow, with primary entry points and callers before their implementation helpers.
- A `useEffect` has a comment only when it carries its own block of logic, and the comment describes the mechanism it maintains across renders. Effects that only set up and clean up have none.
- Comments say only what the code can't, such as a non-obvious reason or a constraint the types don't show. They don't restate a name or type or describe other files, and a rationale appears once, where it is enforced.
- How parts work together, such as a message flow across contexts or files, is explained in a doc under `docs/` with a diagram. The code points to that doc in one line rather than writing the flow out as ASCII art or a list in a comment.
- `undefined` is preferred over `null`, and optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`).
- Props and params are required when all call sites always pass them.
- Arguments are shaped so a call site reads clearly without the signature. A value is passed positionally only when the operation or the value's type makes its role obvious. Otherwise, an options object names each value.
- Every `switch` case body has braces (`case "x": { ... }`, `default: { ... }`).
- Docs, code comments, commit messages, and PR descriptions read naturally for a first-time reader, without the awkward or defensive tone that builds up when text is revised alongside code changes.
- Docs follow the writing conventions in [docs/AGENTS.md](docs/AGENTS.md).

## Tests

- CI runs the full e2e suite on every push to a PR. `pnpm test-e2e` builds the extension and the web app and runs every spec, so a local run is a quick smoke check, such as one targeted spec with `pnpm test-e2e "<file>" -g "<pattern>"`.
- A new test belongs where the repo already tests that kind of code and a regression would be visible to a user. Internal shapes, such as which fields saved data carries, aren't tested when a regression would break nothing.
- When an existing test fails, its expectation is checked from first principles first. The implementation doesn't bend to keep an incorrect test passing.
- E2E timeouts come from measurement. The relevant wait is measured with `createCheckpoint()` from `e2e/helper.ts`. Playwright's default timeout is preferred when it comfortably covers the measured duration, and a custom timeout leaves reasonable headroom, with the measured duration noted beside it.
- The [E2E guide](docs/e2e.md) covers writing and debugging e2e tests.
