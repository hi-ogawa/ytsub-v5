# Caption Schema Rework — text1/text2 model

## Problem

The current per-language-row design pushes alignment complexity to display time. v3's `text1`/`text2` model was better — merge at import time, display trivially.

## Schema rework: back to text1/text2

### Current (v5)

```
captions: id, video_id, language, idx, begin, end, text
unique(video_id, language, idx)
```

Two rows per cue (one per language). Viewer must align them.

### New (v3-style)

```
captions: id, video_id, idx, begin, end, text1, text2
unique(video_id, idx)
```

One row per cue, both languages in same row. Viewer just iterates rows.

### Why

- Merge logic belongs at import time (agent skill), not display time
- v3 proved this works — `mergeTtmlEntries` handles both simple (same timestamps) and complex (overlap heuristic) cases
- Simpler viewer, simpler queries, fewer rows in DB
- `language` column removed — the video's `language1`/`language2` fields already define which is which

## Impact analysis

Files that touch captions table:

| File                                      | Change needed                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/server/schema.ts`                    | Rewrite captions table: drop `language`, add `text1`/`text2`                                       |
| `src/server/migrations/0001_init.sql`     | Rewrite captions DDL                                                                               |
| `src/server/routes/videos.ts`             | Update `createCaptions` input/handler, `getVideo` captionCounts → captionCount, add `listCaptions` |
| `src/server/routes/bookmarks.ts`          | No change (`captionId` FK still works)                                                             |
| `scripts/db-seed.sql`                     | Rewrite caption inserts (single row per cue), update bookmark joins                                |
| `scripts/db-clear.sql`                    | No change                                                                                          |
| `e2e/api.spec.ts`                         | Update caption creation test data, update getVideo assertion                                       |
| `docs/skills/ytsub/scripts/parse-ttml.ts` | Keep as-is (still parses single-language TTML); merge happens in skill, not parser                 |
| `docs/skills/ytsub/SKILL.md`              | Update stage 4 to describe merged format                                                           |

## Implementation steps

### Step 1: Schema migration

Create new migration `0002_captions_text1_text2.sql`:

```sql
-- Recreate captions with text1/text2 (SQLite has no ALTER DROP COLUMN)
DROP TABLE IF EXISTS captions;
CREATE TABLE captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  begin REAL NOT NULL,
  end REAL NOT NULL,
  text1 TEXT NOT NULL DEFAULT '',
  text2 TEXT NOT NULL DEFAULT '',
  UNIQUE(video_id, idx)
);
CREATE INDEX idx_captions_video ON captions(video_id);
```

Note: This drops existing caption data. Acceptable since:

- Only dev/seed data exists
- Bookmarks with `caption_id` get SET NULL via FK constraint

Update `schema.ts` to match:

```ts
export const captions = sqliteTable(
  "captions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    videoId: int("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: int().notNull(),
    begin: real().notNull(),
    end: real().notNull(),
    text1: text().notNull().default(""),
    text2: text().notNull().default(""),
  },
  (t) => [
    unique().on(t.videoId, t.idx),
    index("idx_captions_video").on(t.videoId),
  ],
);
```

### Step 2: Update `createCaptions` API

New input shape:

```ts
z.object({
  videoId: z.number().int(),
  captions: z.array(
    z.object({
      idx: z.number().int(),
      begin: z.number(),
      end: z.number(),
      text1: z.string().default(""),
      text2: z.string().default(""),
    }),
  ),
});
```

Remove `language` from input. Remove `captionCounts` grouping in `getVideo` — replace with simple count.

Add `listCaptions` endpoint:

```ts
listCaptions: os.input(
  z.object({ videoId: z.number().int() }),
).handler(/* select all captions for video, order by idx */);
```

### Step 3: Update seed data

Rewrite `db-seed.sql` to insert paired rows:

```sql
INSERT INTO captions (video_id, idx, begin, end, text1, text2)
SELECT v.id, 0, 0.0, 3.0, '안녕하세요 여러분', 'Hello everyone'
  FROM videos v WHERE v.youtube_id = 'dQw4w9WgXcQ'
UNION ALL ...
```

Update bookmark seed joins (drop `c.language = 'ko'` condition).

### Step 4: Update e2e tests

Update `api.spec.ts`:

- `createCaptions` test: use `text1`/`text2` instead of `language`/`text`
- `getVideo` test: assert `captionCount` (number) instead of `captionCounts` (array)

### Step 5: Update skill docs

Update `SKILL.md` stage 4 to reflect new `createCaptions` input shape (no `language` field, use `text1`/`text2`).

### Step 6: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`
- `pnpm test-e2e`

## Reference: v3 merge logic

From `ytsub-v3/app/utils/youtube.ts`:

1. **Simple path:** If both TTML files have matching timestamps, pair by timestamp
2. **Complex path:** Use language1 timing as base, match language2 cues by time overlap (≥2s merge, else max overlap)

This logic lives in the agent skill (import client), not in the app. The app just receives pre-merged rows.

## Status

- **Planning** — awaiting approval
