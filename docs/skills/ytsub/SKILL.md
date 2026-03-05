# ytsub skill

Given a YouTube URL, produce clean bilingual captions (ko/en) and curated vocab bookmarks, then import to ytsub via API.

## Target artifacts

Each step produces a file in `data/<id>/` for user review before proceeding.

| File             | Quality bar                                                     |
| ---------------- | --------------------------------------------------------------- |
| `video.json`     | Correct metadata (title, channel, duration)                     |
| `captions.json`  | Clean, well-segmented ko/en pairs where translations correspond |
| `bookmarks.json` | 10-20 notable vocab items with correct offsets                  |
| `import.json`    | Valid API payload assembled from above                          |

## File structure

```
./
├── SKILL.md              # this file
├── scripts/
│   ├── parse-json3.ts         # json3 → caption cues JSON
│   └── validate-bookmarks.ts  # auto-correct bookmark offsets
└── data/
    └── <id>/             # per-video working directory
        ├── video.json        # metadata
        ├── ko.json3          # raw Korean subs
        ├── en.json3          # raw English subs
        ├── ko.json           # parsed Korean cues
        ├── en.json           # parsed English cues
        ├── captions.json     # merged bilingual captions
        ├── bookmarks.json    # curated vocab
        └── import.json       # assembled payload
```

## Config

```
APP_BASE_URL = http://localhost:5173   # ytsub app (API at /api)
```

All API calls use `POST ${APP_BASE_URL}/api/<router>/<procedure>` with oRPC envelope:

```bash
curl -X POST "${APP_BASE_URL}/api/videos/importVideo" \
  -H "Content-Type: application/json" \
  -d '{"json": <payload>}'
```

Response is also wrapped: `{"json": <result>}`.

## Error handling

When external tools fail (yt-dlp errors, YouTube API 429s, network issues):

1. Report the exact error to the user
2. Do NOT retry automatically — these are often rate limits or auth issues
3. Wait for user instructions (e.g. retry later, provide cookies, try different video)

---

## Step 1: Fetch & assess

### Download metadata

```bash
mkdir -p ./data/<id> && cd ./data/<id>
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s}' --skip-download "<URL>" > video.json
```

### List available subtitle tracks

```bash
yt-dlp --list-subs --skip-download "<URL>" 2>&1 | grep -E "^\[info\]|^Language|^ko |^en |^en-US"
```

The full output is ~1000 lines (hundreds of auto-translated languages). The grep filter shows section headers and ko/en rows. Check which section each row falls under: `Available subtitles` (manual) vs `Available automatic captions` (auto-generated). Adjust the grep pattern if targeting other languages (e.g. `^ja|^zh`).

### Download subtitles

Prefer manual subs over auto-generated. Use json3 format.

```bash
# Manual subs (preferred)
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
yt-dlp --write-sub --sub-lang en --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.en.json3 en.json3

# Auto-generated (fallback)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
```

### Parse to JSON

```bash
npx tsx ../../scripts/parse-json3.ts ko.json3 ko > ko.json
npx tsx ../../scripts/parse-json3.ts en.json3 en > en.json
```

Output format — arrays of caption cues:

```json
{
  "language": "ko",
  "idx": 0,
  "begin": 25.585,
  "end": 29.489,
  "text": "꼬집어 봐 뜬 꿈인 것 같아"
}
```

### Assess source quality

After fetching and parsing, determine which scenario applies:

| Scenario        | Ko source | En source | Approach                                           |
| --------------- | --------- | --------- | -------------------------------------------------- |
| A: Both manual  | manual    | manual    | Merge with script — done                           |
| B: Ko auto + En | auto      | manual    | Fix ko text using en as context, re-segment, merge |
| C: Ko manual    | manual    | —         | LLM translates ko → en                             |
| D: Ko auto only | auto      | —         | Fix ko text, then LLM translate                    |
| E: Neither      | —         | —         | Stop, ask user                                     |

**Inform the user** which scenario was detected and which subs are manual vs auto-generated before proceeding. If auto-generated quality looks unsalvageable (common with song lyrics), flag this — the user may want a different video.

---

## Step 2: Produce captions.json

The goal is clean, well-segmented ko/en pairs where translations correspond. Use the parsed cues (`ko.json`, `en.json`) as reference material and produce `captions.json` directly.

This is a **translation auditing task**. For each caption, produce correct Korean text and a corresponding English translation. Use whichever sources are available:

| Scenario        | Ko source | En source | What to do                                          |
| --------------- | --------- | --------- | --------------------------------------------------- |
| A: Both manual  | manual    | manual    | Audit en translations against ko, fix misalignments |
| B: Ko auto + En | auto      | manual    | Fix ko text using en as context, align to en timing |
| C: Ko manual    | manual    | —         | Translate ko → en                                   |
| D: Ko auto only | auto      | —         | Fix ko text, then translate to en                   |

Use Korean timestamps as the basis for segmentation, except in scenario B where English timing is more reliable.

When fixing auto-generated Korean, watch for:

- Misheard syllables (e.g. "두정" → "두바이 쿠키", "악몽꽃" → "악몽 꿨어")
- Missing/wrong spacing
- `>>` speaker markers — remove these
- Truncated words at cue boundaries

### Output format

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

**Review:** Check alignment — do ko/en pairs make sense together? Flag any misaligned rows.

---

## Step 3: Pick bookmarks

Agent proposes bookmark candidates (interesting vocab from the Korean captions). User curates the list. Save as `bookmarks.json`.

### What is "notable" vocab

- Intermediate level or above (skip basic greetings, particles, ultra-common verbs like 하다/가다/오다)
- Slang, colloquial expressions, internet-speak that textbooks don't teach
- Hanja-based words where etymology aids memorization
- Konglish or loanwords with interesting usage

Aim for 10-20 words per video.

### Bookmark fields

| Field       | Description                                          |
| ----------- | ---------------------------------------------------- |
| text        | Korean word as it appears in the subtitle            |
| translation | English meaning                                      |
| captionIdx  | Index into merged captions (for timestamp/captionId) |
| side        | 0 = primary (ko), 1 = secondary (en)                 |
| offset      | Character offset of the word within caption text     |
| context     | The full caption line containing the word            |
| notes       | Optional notes                                       |
| status      | "pending" or "learned"                               |

**Output:** `bookmarks.json`:

```json
[
  {
    "text": "헷갈리다",
    "translation": "to be confused",
    "captionIdx": 4,
    "side": 0,
    "offset": 5,
    "context": "아직 좀 헷갈리기는 해",
    "notes": "",
    "status": "pending"
  }
]
```

### Validate offsets

LLMs are unreliable at counting character offsets. Always run validation after producing bookmarks:

```bash
npx tsx ../../scripts/validate-bookmarks.ts bookmarks.json captions.json > bookmarks-fixed.json && mv bookmarks-fixed.json bookmarks.json
```

The script auto-corrects offsets via `indexOf`, fixes context mismatches, and errors on bookmarks where `text` isn't found in the caption at all.

**Review:** User reviews and curates the proposed list.

---

## Step 4: Import

Assemble the import payload from intermediate files, then push via `importVideo`.

```bash
cd ./data/<id>
jq -n --slurpfile c captions.json --slurpfile b bookmarks.json \
  '{video: (input + {language1:"ko",language2:"en"}), captions: [$c[][] | {idx,begin,end,text1:.ko,text2:.en}], bookmarks: $b[]}' \
  video.json > import.json
```

```
POST /api/videos/importVideo
```

```json
{
  "video": {
    "youtubeId": "...",
    "title": "...",
    "channelName": "...",
    "channelId": "...",
    "duration": 210,
    "language1": "ko",
    "language2": "en"
  },
  "captions": [
    { "idx": 0, "begin": 25.585, "end": 29.489, "text1": "...", "text2": "..." }
  ],
  "bookmarks": [
    {
      "text": "헷갈리다",
      "translation": "to be confused",
      "captionIdx": 4,
      "side": 0,
      "offset": 5,
      "context": "아직 좀 헷갈리기는 해"
    }
  ]
}
```

- Map from merged captions: `ko` → `text1`, `en` → `text2`
- `captionIdx` is resolved to `captionId` server-side
- Returns `{ videoId, captions, bookmarks }` with counts

---

## API reference

All endpoints use `POST /api/<router>/<procedure>`.

| Endpoint                   | Key fields                                         |
| -------------------------- | -------------------------------------------------- |
| `videos/importVideo`       | video{}, captions[], bookmarks[] — one-shot import |
| `videos/listVideos`        | limit, offset → {items, total}                     |
| `videos/getVideo`          | id → video + captionCount                          |
| `videos/deleteVideo`       | id (cascades captions)                             |
| `bookmarks/listBookmarks`  | videoId, status, limit, offset → {items, total}    |
| `bookmarks/updateBookmark` | id, status?, translation?, notes?                  |
| `bookmarks/deleteBookmark` | id                                                 |
