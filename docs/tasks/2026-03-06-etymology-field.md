# Add etymology field to bookmarks

## Problem

Etymology (Korean hanja) is valuable for language learning but has no dedicated place in the system. The seed data happened to put hanja info in the `notes` freetext field, but this isn't documented, enforced, or visible in the UI. Neither `notes` nor etymology appear anywhere in the UI currently.

## Approach

Add a dedicated `etymology` column to bookmarks, update the skill docs to instruct agents to populate it with hanja for Korean vocab, and surface both `etymology` and `notes` in the UI.

## Reference files

- `src/server/schema.ts` — bookmarks table definition
- `src/server/migrations/0001_init.sql` — initial migration
- `src/server/routes/bookmarks.ts` — bookmark CRUD (create, update)
- `src/server/routes/videos.ts` — importVideo (creates bookmarks in bulk)
- `src/routes/video-viewer.tsx:228` — `BookmarkWord` (hover popover)
- `src/routes/video-viewer.tsx:295` — `BookmarksList` (bookmark tab list)
- `docs/skills/ytsub/SKILL.md:181` — bookmark fields table
- `scripts/db-seed.sql` — seed data with hanja in notes
- `scripts/db-seed-json/7GU_VQfgMT0/import.json` — seed JSON with hanja in notes

## Implementation steps

### 1. Schema: add `etymology` column

- Add `etymology: text().notNull().default("")` to bookmarks in `schema.ts`
- Create new migration `0002_add_etymology.sql`: `ALTER TABLE bookmarks ADD COLUMN etymology TEXT NOT NULL DEFAULT '';`

### 2. API: expose etymology

- `bookmarks.ts` — add `etymology` to create input schema, update input schema, and list output
- `videos.ts` — add `etymology` to importVideo bookmark input schema

### 3. Skill docs: instruct hanja usage

- `docs/skills/ytsub/SKILL.md` bookmark fields table: add `etymology` field with description like "Hanja/etymology breakdown (e.g. `迷路` or `非現實的; 비(non) + 현실(reality) + 적(adj)`)"
- Update the example JSON to include `"etymology": ""`
- In the "What is notable vocab" section, clarify that hanja-based words should have their etymology populated in this field (not notes)

### 4. UI: show etymology and notes

**BookmarkWord popover** (`video-viewer.tsx:264`):

- After translation, show etymology if present (e.g. small text with hanja characters)
- Do NOT show notes in popover (keep it compact)

**BookmarksList item** (`video-viewer.tsx:403`):

- After translation, show etymology if present
- After etymology, show notes if present
- Both as small muted text lines

### 5. Seed data: migrate hanja from notes to etymology

- Update `scripts/db-seed.sql` and `scripts/db-seed-json/*/import.json` to move hanja content from `notes` to `etymology`

### 6. E2E tests

Add to `e2e/bookmark-viewer.spec.ts` (uses seeded data which will have etymology after step 5):

- **Popover shows etymology**: hover on a bookmark word that has etymology (e.g. 미로 with `迷路`), assert etymology text visible in popover
- **Popover does not show notes**: verify notes text is NOT in the popover
- **Bookmark list shows etymology**: switch to bookmarks tab, assert etymology visible on list item
- **Bookmark list shows notes**: assert notes text visible on list item

Add to `e2e/import.spec.ts` (import flow round-trips etymology):

- **Import preserves etymology**: after importing fixture with etymology field, verify it appears in the bookmark popover/list

## Status

- Done (all 6 steps implemented, 46/46 E2E tests pass)
