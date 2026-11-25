# Agent Guide

## Quick Reference

| Command                 | When                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm tsc && pnpm lint` | After changes (`pnpm lint` formats .ts, .tsx, .md, .json and lints .ts, .tsx) |
| `pnpm build`            | Verify the build                                                              |
| `pnpm test`             | Unit tests (src/, vitest)                                                     |
| `pnpm test-e2e`         | Web app and extension e2e tests. CI runs them all, so run one spec locally    |
| `pnpm build-ext`        | Build the Chrome extension                                                    |
| `pnpm test-youtube`     | Subtitle extraction tests against real YouTube pages                          |

## Key Docs

Read the [product overview](docs/product.md) and the [architecture overview](docs/architecture.md) before implementing features. It also lists the UI surfaces. Read [extension runtime](docs/extension-runtime.md) and [data and sync](docs/data-and-sync.md) before changing extension messaging or storage. [docs/README.md](docs/README.md) indexes the rest of the docs.

## Conventions

- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`) without a scope, such as `docs: link video moments in the zamak skill`. The whole repo is Zamak, so a scope like `(zamak)` adds nothing, and the subject can name the part it touches
- Never rebase, amend, or force push. Merge `origin/main` into the branch when needed
- Never run long-running tasks (dev servers, watch modes, etc.). Use `pnpm build` to verify code, not `pnpm dev`
- Never use `--` to pass args to pnpm scripts. pnpm doesn't need `--` and it silently breaks filtering. Write `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"` directly.
- Run `.ts` scripts with `node` (not `tsx`/`ts-node`), because Node natively supports TypeScript stripping
- File names: kebab-case
- Give each build target its own folder under `src/` (`web/`, `extension/`, `server/`), and keep code they share at the top level of `src/`
- Put code that knows nothing about the app in `src/utils/`, so it imports nothing else from `src/`. App logic goes in `src/lib/`
- Variable names: use full words, such as `bookmark` rather than `bm` and `event` rather than `e`. A one-letter name is fine only as the parameter of a one-expression callback, where the collection names it. Terms the code base or its ecosystem uses as words, such as `id`, `url`, `db`, and `props`, count as full words
- Function names: start with a verb for the action the function performs, so a call site reads as what happens rather than what comes back. This includes class accessors, so write a `get`-prefixed method rather than a getter. Components, hooks, and other constructs with their own ecosystem naming conventions follow those instead
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Comment a `useEffect` only when it carries its own block of logic, and describe the mechanism it maintains across renders. Effects that only set up and clean up need no comment
- Comment only what the code cannot say, such as a non-obvious reason or a constraint the types do not show. Do not restate a name or type, do not describe other files, and state a rationale once, where it is enforced
- Explain how parts work together, such as a message flow across contexts or files, in a doc under `docs/` with a diagram. In the code, point to that doc in one line instead of writing the flow out as ASCII art or a list in a comment
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Shape arguments so a call site reads clearly without the signature. Pass a value positionally only when the operation or the value's type makes its role obvious. Otherwise take an options object, so the names say what each value is
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
- Write docs, code comments, commit messages, and PR descriptions naturally for a first-time reader, without the awkward or defensive tone that builds up when text is revised alongside code changes
- Docs: follow the writing conventions in [docs/AGENTS.md](docs/AGENTS.md)

## Tests

- Leave the full e2e suite to CI, which runs it on every push to a PR, because `pnpm test-e2e` builds the extension and the web app and runs every spec. Locally, run only a quick smoke check, such as one targeted spec with `pnpm test-e2e "<file>" -g "<pattern>"`.
- Before adding a test, check that the repo tests that kind of code and that a regression would be visible to a user. Don't test internal shapes, such as which fields saved data carries, when a regression would break nothing.
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- Before adding or increasing an E2E timeout, measure the relevant wait with `createCheckpoint()` from `e2e/helper.ts`. Prefer Playwright's default timeout when it comfortably covers the measured duration. If a custom timeout is needed, allow reasonable headroom and document the measured duration beside it.
- Follow the [E2E guide](docs/e2e.md) when writing or debugging e2e tests.
