# Agent Guide

## Quick Reference

| Command                 | When                                                      |
| ----------------------- | --------------------------------------------------------- |
| `pnpm tsc && pnpm lint` | After changes (`pnpm lint` formats .ts, .tsx, .md, .json) |
| `pnpm build`            | Verify the build                                          |
| `pnpm test`             | Unit tests (src/, vitest)                                 |
| `pnpm test-e2e`         | Web app e2e tests                                         |
| `pnpm build-ext`        | Build the Chrome extension                                |
| `pnpm test-e2e-ext`     | Extension e2e tests (run `pnpm build-ext` first)          |
| `pnpm test-e2e-full`    | Web app and extension e2e tests                           |
| `pnpm test-youtube`     | Subtitle extraction tests against real YouTube pages      |

## Key Docs

Read the [architecture overview](docs/architecture.md) before implementing features. It also lists the UI surfaces and the `/dev` routes that mirror the extension. [docs/README.md](docs/README.md) indexes the rest of the docs.

## Conventions

- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)
- Never rebase, amend, or force push. Merge `origin/main` into the branch when needed
- Never run long-running tasks (dev servers, watch modes, etc.). Use `pnpm build` to verify code, not `pnpm dev`
- Never use `--` to pass args to pnpm scripts. pnpm doesn't need `--` and it silently breaks filtering. Write `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"` directly.
- Run `.ts` scripts with `node` (not `tsx`/`ts-node`), because Node natively supports TypeScript stripping
- File names: kebab-case
- Function names: start with a verb for the action the function performs, so a call site reads as what happens rather than what comes back. This includes class accessors, so write a `get`-prefixed method rather than a getter. Components, hooks, and other constructs with their own ecosystem naming conventions follow those instead
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Comment a `useEffect` only when it carries its own block of logic, and describe the mechanism it maintains across renders. Effects that only set up and clean up need no comment
- Comment only what the code cannot say, such as a non-obvious reason or a constraint the types do not show. Do not restate a name or type, do not describe other files, and state a rationale once, where it is enforced
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Shape arguments the way a reader expects from the operation. Take a value positionally when the operation conventionally takes just that value. Use an options object when a call site would be ambiguous without names
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
- Write docs, code comments, commit messages, and PR descriptions naturally for a first-time reader, without the awkward or defensive tone that builds up when text is revised alongside code changes

## Tests

- Before adding a test, check that the repo tests that kind of code and that a regression would be visible to a user. Don't test internal shapes, such as which fields saved data carries, when a regression would break nothing.
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- E2E tests split along the auth boundary. Prefer `/dev` route tests, which use fixture data and need no `login()` or `setupDb()`. Use `setupDb({ seed: true })` and `login(page)` only when the feature needs the server. Never add `login()` to a test that only uses `/dev` routes.
- Follow the [E2E guide](docs/e2e.md) when writing or debugging e2e tests.
