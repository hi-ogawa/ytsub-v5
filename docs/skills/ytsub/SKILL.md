# ytsub skill

Fetch Korean subtitles from YouTube, align translations, extract vocabulary, and push everything to ytsub via API.

## Pipeline overview

```
YouTube URL
  │
  ├─ 1. Fetch subs ─────────── video.json, ko.ttml, en.ttml
  │
  ├─ 2. Parse TTML ─────────── ko.json, en.json
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
│   └── parse-ttml.ts     # TTML → caption cues JSON
└── data/
    └── <id>/             # per-video working directory
        ├── video.json        # stage 1: metadata
        ├── ko.ttml           # stage 1: raw Korean subs
        ├── en.ttml           # stage 1: raw English subs
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
yt-dlp --list-subs --skip-download "<URL>" 2>&1
```

Review output to identify available subtitle languages and whether they are manual or auto-generated.

### Download metadata + subtitles

```bash
mkdir -p ./data/<id> && cd ./data/<id>
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s}' --skip-download "<URL>" > video.json
```

Prefer manual subs over auto-generated. Use TTML format.

```bash
# Manual subs (preferred)
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"
mv <id>.ko.ttml ko.ttml
yt-dlp --write-sub --sub-lang en --skip-download --sub-format ttml -o "%(id)s" "<URL>"
mv <id>.en.ttml en.ttml

# Auto-generated (fallback — may need correction)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"
mv <id>.ko.ttml ko.ttml
```

If manual subs aren't available for a language, skip it — pick a different video that has manual subs.

**Output:** `video.json`, `ko.ttml`, `en.ttml`

**Review:** Check video.json fields. Open TTML files and verify the text is actual lyrics/dialogue.

### TTML format reference

```xml
<p begin="00:01:23.456" end="00:01:27.890" style="s2">안녕하세요 여러분</p>
```

- `<p>` elements inside `<div>` inside `<body>`
- Timestamps: `HH:MM:SS.mmm` (dot separator)
- Text may contain `&gt;&gt;` (speaker indicators), `<br />` (line breaks)
- HTML entities need decoding

---

## Stage 2: Parse TTML → JSON

```bash
node ./scripts/parse-ttml.ts ko.ttml > ko.json
node ./scripts/parse-ttml.ts en.ttml > en.json
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

Korean timestamps are the source of truth. For each Korean cue, find the English cue with the most timestamp overlap and pair them.

Agent reads both JSON files and writes `captions.json`:

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

## Stage 4: Pick bookmarks

Agent proposes bookmark candidates (interesting vocab from the Korean captions). User curates the list. Save as `bookmarks.json`.

### What is "notable" vocab

- Intermediate level or above (skip basic greetings, particles, ultra-common verbs like 하다/가다/오다)
- Slang, colloquial expressions, internet-speak that textbooks don't teach
- Hanja-based words where etymology aids memorization
- Konglish or loanwords with interesting usage

Aim for 5-15 words per video.

### Bookmark fields

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
      "offset": 4,
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
