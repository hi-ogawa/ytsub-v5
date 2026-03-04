# Seed data workflow

Generate `scripts/db-seed.sql` from a real YouTube video. Each step produces a file that the user reviews before proceeding.

All intermediate files live in `docs/skills/ytsub/data/raw/`.

## Pipeline

```
1. Fetch metadata + TTML   yt-dlp → .video.json, .ko.ttml, .en.ttml  (user reviews)
2. Parse TTML              parse-ttml.ts → .ko.json, .en.json        (user reviews)
3. Merge captions          agent aligns → .captions.json              (user reviews)
4. Pick bookmarks          agent proposes, user curates                (user reviews)
5. Generate seed SQL       gen-seed-sql.ts → db-seed.sql              (user verifies)
```

---

## Step 1: Fetch metadata + TTML

Fetch video metadata:

```bash
cd docs/skills/ytsub/data/raw
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s}' --skip-download "<URL>" > <id>.video.json
```

Check available subs:

```bash
yt-dlp --list-subs --skip-download "<URL>" 2>&1
```

Download manual subs only. Never use `--write-auto-sub` — auto-generated captions are too noisy for seed data.

```bash
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"
yt-dlp --write-sub --sub-lang en --skip-download --sub-format ttml -o "%(id)s" "<URL>"
```

If manual subs aren't available for a language, skip it — pick a different video that has manual subs.

**Output:** `<id>.video.json`, `<id>.ko.ttml`, `<id>.en.ttml`

**Review:** Check video.json fields. Open TTML files and verify the text is actual lyrics/dialogue.

---

## Step 2: Parse TTML → JSON

```bash
node docs/skills/ytsub/scripts/parse-ttml.ts <id>.ko.ttml > <id>.ko.json
node docs/skills/ytsub/scripts/parse-ttml.ts <id>.en.ttml > <id>.en.json
```

**Output:** `<id>.ko.json`, `<id>.en.json` — arrays of caption cues:

```json
{
  "language": "ko",
  "idx": 0,
  "begin": 25.585,
  "end": 29.489,
  "text": "꼬집어 봐 뜬 꿈인 것 같아"
}
```

**Review:** Spot-check cue count, timestamps, text content.

---

## Step 3: Merge captions

Korean timestamps are the source of truth. For each Korean cue, find the English cue with the most timestamp overlap and pair them.

Agent reads both JSON files and writes `<id>.captions.json`:

```json
[
  {
    "idx": 0,
    "begin": 25.585,
    "end": 29.489,
    "ko": "꼬집어 봐 뜬 꿈인 것 같아",
    "en": "am I awake? or am I still dreaming"
  }
]
```

When multiple English cues overlap a single Korean cue, concatenate them with a space. When no English cue overlaps, set `"en": ""`.

**Review:** Check alignment — do ko/en pairs make sense together? Flag any misaligned rows for the agent to fix.

---

## Step 4: Pick bookmarks

Agent proposes bookmark candidates (interesting vocab from the Korean captions). User curates the list. Save as `<id>.bookmarks.json`:

```json
[
  {
    "text": "헷갈리다",
    "translation": "to be confused",
    "captionIdx": 4,
    "side": 0,
    "offset": 6,
    "context": "아직 좀 헷갈리기는 해",
    "notes": "",
    "status": "pending"
  }
]
```

| Field       | Description                                          |
| ----------- | ---------------------------------------------------- |
| text        | Korean headword (dictionary form)                    |
| translation | English meaning                                      |
| captionIdx  | Index into merged captions (for timestamp/captionId) |
| side        | 0 = primary (ko), 1 = secondary (en)                 |
| offset      | Character offset of the word within caption text     |
| context     | The full caption line containing the word            |
| notes       | Optional notes                                       |
| status      | "pending" or "learned"                               |

---

## Step 5: Generate seed SQL

```bash
node scripts/gen-seed-sql.ts <id>.video.json <id>.captions.json [<id>.bookmarks.json] > scripts/db-seed.sql
```

Pure script — reads JSON files, emits SQL to stdout. No network calls.

**Verify:**

```bash
pnpm db:reset && pnpm db:seed
```

---

## File summary

After completing all steps for video `7GU_VQfgMT0`:

```
docs/skills/ytsub/data/raw/
├── 7GU_VQfgMT0.video.json     # step 1
├── 7GU_VQfgMT0.ko.ttml        # step 1
├── 7GU_VQfgMT0.en.ttml        # step 1
├── 7GU_VQfgMT0.ko.json        # step 2
├── 7GU_VQfgMT0.en.json        # step 2
├── 7GU_VQfgMT0.captions.json  # step 3
└── 7GU_VQfgMT0.bookmarks.json # step 4

scripts/
├── gen-seed-sql.ts             # step 5 script
└── db-seed.sql                 # step 5 output
```
