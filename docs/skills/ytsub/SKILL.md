# ytsub skill

Fetch Korean subtitles from YouTube, align translations, extract vocabulary, and push everything to ytsub via API.

## Pipeline overview

```
YouTube URL
  │
  ├─ 1. Fetch subs ─────────── raw TTML files + metadata
  │
  ├─ 2. Parse TTML ─────────── .ko.json, .en.json
  │
  ├─ 3. Merge captions ─────── .captions.json (paired ko/en)
  │
  ├─ 4. Push video + captions ─ createVideo → createCaptions
  │
  ├─ 5. Pick bookmarks ─────── user curates vocab list
  │
  └─ 6. Push bookmarks ─────── createBookmarks
```

Each step produces output that the user reviews before proceeding. All intermediate files live in `data/raw/`.

## File structure

```
docs/skills/ytsub/
├── SKILL.md          # this file
├── scripts/
│   └── parse-ttml.ts # TTML → caption cues JSON
└── data/
    └── raw/          # yt-dlp output + intermediate JSON
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
cd docs/skills/ytsub/data/raw
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s}' --skip-download "<URL>" > <id>.video.json
```

Prefer manual subs over auto-generated. Use TTML format.

```bash
# Manual subs (preferred)
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"
yt-dlp --write-sub --sub-lang en --skip-download --sub-format ttml -o "%(id)s" "<URL>"

# Auto-generated (fallback — may need correction)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"
```

If manual subs aren't available for a language, skip it — pick a different video that has manual subs.

**Output:** `<id>.video.json`, `<id>.ko.ttml`, `<id>.en.ttml`

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

## Stage 3: Merge captions

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

## Stage 4: Push video + captions

### 4a. Create video

```
POST /api/createVideo
```

```json
{
  "youtubeId": "dQw4w9WgXcQ",
  "title": "Video Title",
  "channelName": "Channel Name",
  "channelId": "UCxxxxxx",
  "duration": 245,
  "language1": "ko",
  "language2": "en"
}
```

Returns the video row (includes `id` needed for subsequent calls). Upserts on `youtubeId` conflict.

Use metadata from `<id>.video.json` (stage 1).

### 4b. Create captions

```
POST /api/createCaptions
```

```json
{
  "videoId": 1,
  "captions": [
    {
      "idx": 0,
      "begin": 25.585,
      "end": 29.489,
      "text1": "꼬집어 봐 뜬 꿈인 것 같아",
      "text2": "am I awake? or am I still dreaming"
    }
  ]
}
```

Map from merged captions: `ko` → `text1`, `en` → `text2`.

Returns `{ inserted: number }`.

---

## Stage 5: Pick bookmarks

Agent proposes bookmark candidates (interesting vocab from the Korean captions). User curates the list.

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

---

## Stage 6: Push bookmarks

```
POST /api/createBookmarks
```

```json
{
  "bookmarks": [
    {
      "videoId": 1,
      "text": "헷갈리다",
      "translation": "to be confused",
      "context": "아직 좀 헷갈리기는 해",
      "timestamp": 39.954,
      "notes": "",
      "status": "pending"
    }
  ]
}
```

Use `captionIdx` to look up timestamp from merged captions.

Returns `{ inserted: number }`.

---

## API reference

| Endpoint          | Key fields                                                         |
| ----------------- | ------------------------------------------------------------------ |
| `createVideo`     | youtubeId, title, channelName, channelId, duration, language1/2    |
| `createCaptions`  | videoId, captions[]{idx, begin, end, text1, text2}                 |
| `createBookmarks` | bookmarks[]{videoId, text, translation, context, timestamp, notes} |
| `listVideos`      | limit, offset → {items, total}                                     |
| `getVideo`        | id → video + captionCount                                          |
| `listBookmarks`   | videoId, status, limit, offset → {items, total}                    |
| `deleteVideo`     | id                                                                 |
| `deleteBookmark`  | id                                                                 |
| `updateBookmark`  | id, status?, translation?, notes?                                  |
