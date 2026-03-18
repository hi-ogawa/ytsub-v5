# Integer Timestamps Migration

## Problem

All server-side timestamps (`created_at`, `updated_at`) use SQLite `datetime('now')` which produces `"2026-03-18 01:06:35"` (space separator, no Z). Client-side timestamps use `new Date().toISOString()` which produces `"2026-03-18T01:06:35.123Z"` (T separator, Z suffix, milliseconds).

`computeSyncState` compares these with string `>`. Space (0x20) < T (0x54), so `serverUpdatedAt > syncedAt` is **always false** — server-side changes after sync are never detected.

This is a schema-wide problem, not a one-off bug. The fix: store all timestamps as Unix epoch integers.

## Affected columns

| Table     | Column     | Default           | Also set explicitly in                |
| --------- | ---------- | ----------------- | ------------------------------------- | ----------------------------------------------------------------- |
| users     | created_at | `datetime('now')` | —                                     |
| videos    | created_at | `datetime('now')` | —                                     |
| videos    | updated_at | `datetime('now')` | `videos.ts:37,204`, `bookmarks.ts:31` |
| captions  | created_at | `datetime('now')` | —                                     | (\* column exists in SQL but not in drizzle schema — dead column) |
| bookmarks | created_at | `datetime('now')` | —                                     |

Client-side timestamps (localStorage, not DB):

- `video-index.ts` — `updatedAt`, `syncedAt`: use `new Date().toISOString()`
- `caption-session.ts` — bookmark `createdAt`: use `new Date().toISOString()`

## Approach: Unix epoch seconds everywhere

**Why seconds:** SQLite `unixepoch()` natively returns seconds. Drizzle `int()` maps to TS `number`. Using seconds means no conversion at the DB layer — the ORM does the heavy lifting. Client divides `Date.now() / 1000` (or uses `Math.floor`).

**Drizzle ORM advantage:** Changing `text()` → `int()` in `schema.ts` flips the TypeScript type from `string` → `number` across all Drizzle query results, oRPC response types, and client-side consumers. `tsc` flags every mismatch — the compiler enforces the migration is complete.

**Server (SQLite + Drizzle):**

- `schema.ts`: change `text("created_at")` → `int("created_at")`, same for `updated_at`
- Defaults: `(unixepoch())` instead of `(datetime('now'))`
- Route-level explicit sets: `sql\`unixepoch()\``instead of`sql\`datetime('now')\``
- No manual type annotations needed — Drizzle infers `number` from `int()`

**Client (localStorage):**

- `video-index.ts`: `Math.floor(Date.now() / 1000)` instead of `new Date().toISOString()`
- Type changes: `updatedAt: string` → `updatedAt: number`, `syncedAt?: string` → `syncedAt?: number`

**Sync comparison** in `computeSyncState`: numeric `>` — no format ambiguity, no cross-format bugs possible.

## Open questions

1. **Migration strategy for existing data?** Production DB has text timestamps that need converting. `strftime('%s', created_at)` converts existing text → epoch. Need a migration file `0002_integer_timestamps.sql`.
2. **Bookmark `createdAt`** — this lives in IndexedDB/chrome.storage, serialized as JSON. Changing type breaks existing client data. Need a client-side migration or keep as ISO string (it's never compared cross-boundary).

## Reference files

- `src/server/schema.ts` — drizzle schema (all column definitions)
- `src/server/migrations/0001_init.sql` — raw SQL schema
- `src/server/routes/videos.ts` — explicit `updated_at` sets
- `src/server/routes/bookmarks.ts` — explicit `updated_at` set
- `src/lib/video-index.ts` — client `updatedAt`/`syncedAt`
- `src/lib/sync.ts` — `computeSyncState` (the comparison that breaks)
- `src/lib/caption-session.ts` — bookmark `createdAt`

## Implementation steps

1. Decide on seconds vs milliseconds
2. Write migration `0002_integer_timestamps.sql` converting existing text columns
3. Update `schema.ts` — change column types to `int()`, defaults to `(unixepoch())`
4. Update `videos.ts`, `bookmarks.ts` — explicit sets to `unixepoch()`
5. Update `video-index.ts` — `Date.now()` instead of `new Date().toISOString()`, type `number`
6. Update `sync.ts` — type changes (comparison logic stays the same, just numeric now)
7. Decide on client-side bookmark `createdAt` — migrate or leave as string
8. Update e2e tests (`helper.ts`, `sync.spec.ts`) — timestamp assertions/fixtures
9. Run `pnpm tsc && pnpm lint && pnpm build && pnpm test-e2e`

## Test cases to cover or adjust

**Unit tests (`src/lib/sync.test.ts`):**

- Full 16-case `computeSyncState` table already exists with string timestamps — change to integer values (e.g. `T1=1000, T2=2000, T3=3000`). Same combinatorial coverage, just numeric.

**E2e tests (`e2e/sync.spec.ts`):**

- **Add `bumpServerUpdatedAt` helper** (`e2e/helper.ts`): directly UPDATE the sqlite `updated_at` column to a future epoch value, simulating another device pushing. Currently blocked by the format mismatch — integer timestamps unblock this.
- **Rework pull test**: currently uses `dev` seed user (pre-existing server data) to test pull. With `bumpServerUpdatedAt`, can use `dev-empty`: push first → bump server timestamp → reload → verify "pull" → pull → verify "synced".
- **Rework conflict tests**: same pattern — push → bump server + create local bookmark → verify "conflict" → resolve via dialog. Eliminates artificial seed data overlap between `db-seed-json` and `youtube-json` fixtures.
- **Goal**: all sync e2e tests use `dev-empty` user, building state explicitly. No reliance on `dev` seed user's pre-seeded server data overlapping with fixture captions.

**Seed data (`e2e/sync.spec.ts` tests #2, #5, #6, #7):**

- These currently depend on `dev` user having server data for `7GU_VQfgMT0` (from `db-seed-json`). After migration, replace with explicit push-then-bump-then-test flows using `dev-empty`.

## Status

- Done:
  - Added `src/server/migrations/0002_integer_timestamps.sql` to convert existing `users`, `videos`, and `bookmarks` timestamp columns from SQLite datetime text to epoch-second integers.
  - Updated `src/server/schema.ts` and route-level writes in `src/server/routes/videos.ts` and `src/server/routes/bookmarks.ts` to use integer timestamps via `unixepoch()`.
  - Switched local `video-index` timestamps (`updatedAt`, `syncedAt`) to numbers and added read-time normalization so existing ISO-string local data still loads.
  - Updated `src/lib/sync.ts` and `src/lib/sync.test.ts` to compare numeric timestamps.
  - Reworked sync e2e helpers/specs to simulate remote updates by bumping `videos.updated_at` directly, and updated extension fixture entries to use numeric `updatedAt`.
  - Kept bookmark `createdAt` as ISO strings in IndexedDB/chrome storage; server bookmark timestamps are converted back to ISO when pulled into local sessions.
- Remaining:
  - The reworked Playwright sync specs were updated but not executed in this session.
  - The new D1 migration still needs to be applied in each environment before deploying code that expects integer timestamps.
- Blockers/open questions:
  - None for implementation. The remaining work is operational rollout.
