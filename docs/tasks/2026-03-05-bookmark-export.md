# Bookmark Export (for Anki pipeline via agent skill)

## Problem

The ytsub skill imports videos with bookmarks (Steps 1-4), but there's no way to get curated bookmarks back out for the downstream Anki pipeline. The missing link:

```
ytsub (viewer/curator) → export bookmarks → enrich → anki-import.py → Anki
```

The downstream `korean-vocab` skill already has `anki-import.py` that takes a JSON array and handles audio generation, card creation, and sync. We need:

1. An API endpoint to export bookmarks from ytsub
2. A new step in the ytsub skill doc describing how the agent calls export, enriches, and hands off to `anki-import.py`

## Reference

### anki-import.py input format (`korean-vocab/stages/anki-import.md`)

```json
[
  {
    "korean": "직진하다",
    "english": "to go straight, charge ahead",
    "example_ko": "한번 꽂히면 직진하는 스타일이라",
    "example_en": "Once I get into something, I go all in",
    "etymology": "直進",
    "notes": "colloquial"
  }
]
```

### Field mapping: ytsub bookmark → anki-import input

| Bookmark field | anki-import field | Transform                        |
| -------------- | ----------------- | -------------------------------- |
| `text`         | `korean`          | direct                           |
| `translation`  | `english`         | direct                           |
| `context`      | `example_ko`      | direct                           |
| --             | `example_en`      | agent translates context via LLM |
| --             | `etymology`       | agent generates via LLM          |
| `notes`        | `notes`           | direct                           |

## Plan

### 1. Server endpoint (`src/server/routes/bookmarks.ts`)

Add `bookmarks/exportBookmarks`:

- Input: `{ videoId: number, status?: string }`
- Fetch video metadata (for context — youtubeId, title, channel, languages)
- Fetch all matching bookmarks (no pagination)
- Return structured JSON

Response shape:

```json
{
  "video": {
    "youtubeId": "7GU_VQfgMT0",
    "title": "Billlie | 'cloud palace'",
    "channelName": "Billlie",
    "language1": "ko",
    "language2": "en"
  },
  "bookmarks": [
    {
      "text": "꼬집어",
      "translation": "to pinch",
      "context": "꼬집어 봐 뜬 꿈인 것 같아",
      "notes": "꼬집어 보다 = pinch oneself to check if dreaming",
      "timestamp": 25.585,
      "status": "pending"
    }
  ]
}
```

### 2. Update ytsub skill doc (`docs/skills/ytsub/SKILL.md`)

Add Step 5: Export to Anki. Documents the agent workflow:

1. Call `exportBookmarks` API for the video
2. Enrich each bookmark:
   - `text` → `korean`
   - `translation` → `english`
   - `context` → `example_ko`
   - LLM translate `context` → `example_en`
   - LLM generate `etymology` (hanja if applicable)
   - `notes` → `notes`
3. Save as JSON in `korean-vocab/data/YYYY-MM-DD-<title>-<id>.json`
4. Run `anki-import.py --apply`

### 3. Update API reference in skill doc

Add `bookmarks/exportBookmarks` to the API reference table at bottom of `SKILL.md`.

### Files to modify

| File                             | Change                            |
| -------------------------------- | --------------------------------- |
| `src/server/routes/bookmarks.ts` | Add `exportBookmarks` endpoint    |
| `docs/skills/ytsub/SKILL.md`     | Add Step 5 + update API reference |

## Status

- [ ] Plan approved
- [ ] Implementation started
- [ ] Complete
