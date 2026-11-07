# Server Timestamp Normalization

## Problem

`computeSyncState` (`src/lib/sync.ts:68-69`) compares `localUpdatedAt` against `serverUpdatedAt` using string `>`. The two sides use different formats:

- **Server (SQLite):** `datetime('now')` → `"2026-03-18 01:06:35"` (space separator, no Z)
- **Client (JS):** `new Date().toISOString()` → `"2026-03-18T01:06:35.123Z"` (T separator, Z suffix, milliseconds)

Space (0x20) < T (0x54), so server timestamps always appear "older" than client timestamps — pull is never detected.

Both are UTC (SQLite `datetime('now')` is always UTC), so the values are semantically compatible — only the format differs.

## Approach: Drizzle `customType` with `fromDriver` normalization

Instead of migrating the DB to integer timestamps or patching every route handler, define a custom Drizzle column type that normalizes SQLite datetime strings to ISO 8601 on read.

```ts
const utcDatetime = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text";
  },
  fromDriver(value) {
    // "2026-03-18 01:06:35" → "2026-03-18T01:06:35Z"
    return value.replace(" ", "T") + "Z";
  },
});
```

Replace `text()` with `utcDatetime()` on all timestamp columns in `schema.ts`. Every Drizzle query result automatically returns ISO strings. No DB migration, no client changes, no per-route patching.

### Why this is sound

- **Single conversion point** — only `schema.ts` changes; all queries benefit automatically
- **No DB migration** — column stays `text`, SQLite `datetime('now')` defaults stay as-is
- **No client changes** — TypeScript type stays `string`, client code unchanged
- **Lexicographic comparison works** — ISO 8601 with consistent `T` separator sorts correctly
- **No precision issue** — server lacks milliseconds (`T01:06:35Z` vs `T01:06:35.123Z`), but this is fine: server time is always <= client syncedAt time

### What it doesn't fix

- The underlying text format in the DB stays as SQLite datetime. A future integer migration (per `docs/tasks/2026-03-18-integer-timestamps.md`) can still happen independently.
- `fromDriver` only applies on read. Any raw SQL queries bypassing Drizzle won't get normalization (none exist currently).

## Reference files

- `src/server/schema.ts` — column definitions to change
- `src/lib/sync.ts` — `computeSyncState` (the broken comparison, no changes needed)
- `src/lib/video-index.ts` — client timestamps (no changes needed)
- `src/server/routes/videos.ts` — routes returning timestamps (no changes needed)
- `src/server/routes/bookmarks.ts` — routes returning timestamps (no changes needed)

## Implementation steps

1. Define `utcDatetime` custom type in `schema.ts` (import `customType` from `drizzle-orm/sqlite-core`)
2. Replace `text("created_at")` → `utcDatetime("created_at")` on: `users.createdAt`, `videos.createdAt`, `videos.updatedAt`, `bookmarks.createdAt`
3. Keep `.notNull().default(sql`(datetime('now'))`)` — defaults unchanged
4. Run `pnpm tsc && pnpm lint` — confirm no type errors (type stays `string`)
5. Run `pnpm build` — confirm build passes
6. Commit and create PR
7. Run `pnpm test-e2e` — confirm sync detection works correctly

## Status

- Done: task doc created
- Remaining: implementation
- Blockers: none
