# ytsub skill

Fetch Korean subtitles from YouTube, align translations, extract vocabulary, and push everything to ytsub via API.

## Pipeline overview

```
YouTube URL
  │
  ├─ 1. Fetch subs ─────────── video.json, ko.json3, en.json3
  │
  ├─ 2. Parse subs ─────────── ko.json, en.json
  │
  ├─ 3. Merge captions ─────── captions.json (paired ko/en)
  │
  ├─ 4. Pick bookmarks ─────── bookmarks.json (user curates)
  │
  └─ 5. Import ────────────────  importVideo API
```

Each step produces a file in `data/<id>/` that the user reviews before proceeding.

## File structure

```
./
├── SKILL.md              # this file
├── scripts/
│   ├── parse-json3.ts         # json3 → caption cues JSON
│   ├── merge-captions.ts      # ko.json + en.json → captions.json
│   └── validate-bookmarks.ts  # auto-correct bookmark offsets
└── data/
    └── <id>/             # per-video working directory
        ├── video.json        # stage 1: metadata
        ├── ko.json3          # stage 1: raw Korean subs
        ├── en.json3          # stage 1: raw English subs
        ├── ko.json           # stage 2: parsed Korean cues
        ├── en.json           # stage 2: parsed English cues
        ├── captions.json     # stage 3: merged bilingual captions
        ├── bookmarks.json    # stage 4: curated vocab
        └── import.json       # stage 5: assembled payload
```

## Config

```
APP_BASE_URL = http://localhost:5173   # ytsub app (API at /api)
```

All API calls use `${APP_BASE_URL}/api/<procedure>`.

---

## Stage 1: Fetch subs

### List available tracks

```bash
yt-dlp --list-subs --skip-download "<URL>" 2>&1 | grep -E "^\[info\]|^Language|^ko |^en "
```

The full `--list-subs` output is ~800 lines (hundreds of auto-translated languages). The grep filter shows only section headers and ko/en rows. Look for the `Available subtitles` section (manual) vs `Available automatic captions` (auto-generated).

### Download metadata + subtitles

```bash
mkdir -p ./data/<id> && cd ./data/<id>
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s}' --skip-download "<URL>" > video.json
```

Prefer manual subs over auto-generated. Use json3 format.

```bash
# Manual subs (preferred)
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
yt-dlp --write-sub --sub-lang en --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.en.json3 en.json3

# Auto-generated (fallback — may need correction)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
```

If manual subs aren't available for a language, skip it — pick a different video that has manual subs.

**Output:** `video.json`, `ko.json3`, `en.json3`

**Review:** Check video.json fields. Spot-check json3 events have text content.

### json3 format reference

```json
{
  "events": [
    {
      "tStartMs": 25585,
      "dDurationMs": 3904,
      "segs": [{ "utf8": "꼬집어 봐 뜬 꿈인 것 같아" }]
    }
  ]
}
```

- `tStartMs` — start time in milliseconds
- `dDurationMs` — duration in milliseconds
- `segs[].utf8` — text segments (join them)
- Events without `segs` or `dDurationMs` are metadata — skip them

---

## Stage 2: Parse subs → JSON

```bash
node ../../scripts/parse-json3.ts ko.json3 ko > ko.json
node ../../scripts/parse-json3.ts en.json3 en > en.json
```

**Output:** `ko.json`, `en.json` — arrays of caption cues:

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

## Stage 3: Merge captions

```bash
node ../../scripts/merge-captions.ts ko.json en.json > captions.json
```

Korean timestamps are the source of truth. For each Korean cue, the script finds the English cue with the most timestamp overlap and pairs them. When no English cue overlaps, `en` is set to `""`.

**Output:** `captions.json`:

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

**Review:** Check alignment — do ko/en pairs make sense together? Flag any misaligned rows for the agent to fix.

---

## Stage 4: Pick bookmarks

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

## Stage 5: Import

Assemble the import payload from intermediate files, then push via `importVideo`.

```bash
cd ./data/<id>
jq -n --slurpfile c captions.json --slurpfile b bookmarks.json \
  '{video: (input + {language1:"ko",language2:"en"}), captions: [$c[][] | {idx,begin,end,text1:.ko,text2:.en}], bookmarks: $b[]}' \
  video.json > import.json
```

```
POST /api/importVideo
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

| Endpoint         | Key fields                                         |
| ---------------- | -------------------------------------------------- |
| `importVideo`    | video{}, captions[], bookmarks[] — one-shot import |
| `listVideos`     | limit, offset → {items, total}                     |
| `getVideo`       | id → video + captionCount                          |
| `listBookmarks`  | videoId, status, limit, offset → {items, total}    |
| `deleteVideo`    | id (cascades captions)                             |
| `deleteBookmark` | id                                                 |
| `updateBookmark` | id, status?, translation?, notes?                  |
