# ytsub skill

Fetch Korean subtitles from YouTube, correct/translate via LLM, extract vocabulary, and push everything to ytsub.

## Pipeline overview

```
YouTube URL
  │
  ├─ 1. Fetch subs ─────────── raw TTML files in working dir
  │
  ├─ 2. Correct Korean ─────── (optional, if auto-generated)
  │
  ├─ 3. Translate ──────────── (optional, if no English sub)
  │
  ├─ 4. Push video + captions ─ createVideo → createCaptions
  │
  ├─ 5. Extract vocab ──────── markdown table
  │
  ├─ 6. Review vocab ────────── (optional, user curates)
  │
  └─ 7. Push bookmarks ─────── createBookmarks
```

Each stage is independent — run any subset in order.

## File structure

```
docs/skills/ytsub/
├── SKILL.md          # this file
├── scripts/
│   └── parse-ttml.ts # TTML → caption cues JSON
└── data/
    ├── raw/          # yt-dlp output + parsed JSON
    │   ├── dQw4w9WgXcQ.ko.ttml
    │   ├── dQw4w9WgXcQ.ko.json
    │   ├── dQw4w9WgXcQ.en.ttml
    │   └── dQw4w9WgXcQ.en.json
    └── vocab/        # extracted vocab tables
        └── 2026-03-04-video-title-dQw4w9WgXcQ.md
```

## Config

```
APP_BASE_URL = http://localhost:5173   # ytsub dev server (tRPC at /api)
```

All API calls use the tRPC endpoints at `${APP_BASE_URL}/api/<procedure>`.

---

## Stage 1: Fetch subs

### List available tracks

```bash
yt-dlp --list-subs --skip-download "<URL>" 2>&1
```

Review output to identify available subtitle languages and whether they are manual or auto-generated.

### Download subtitles

Prefer manual subs over auto-generated. Use TTML format (proven from ytsub-v3).

```bash
# Manual Korean subs (preferred)
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"

# Auto-generated Korean subs (fallback)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format ttml -o "%(id)s" "<URL>"

# Other manual subs for cross-reference (e.g. English, Japanese)
yt-dlp --write-sub --sub-lang en --skip-download --sub-format ttml -o "%(id)s" "<URL>"
```

Output files: `<video_id>.ko.ttml`, `<video_id>.en.ttml`, etc.

### TTML format reference

```xml
<p begin="00:01:23.456" end="00:01:27.890" style="s2">안녕하세요 여러분</p>
<p begin="00:01:28.000" end="00:01:32.500" style="s2">&gt;&gt; 오늘은 명동에 왔습니다</p>
```

- `<p>` elements inside `<div>` inside `<body>`
- Timestamps: `HH:MM:SS.mmm` (dot separator, not comma like SRT)
- Text may contain `&gt;&gt;` (speaker indicators), `<br />` (line breaks)
- HTML entities need decoding (`&amp;`, `&lt;`, `&gt;`, etc.)

### Parsing TTML to caption cues

Use the parse script:

```bash
node docs/skills/ytsub/scripts/parse-ttml.ts <file.ttml> [language] > <file.json>
```

Save output to `data/raw/<id>.<lang>.json`. Language auto-detected from filename (e.g. `abc.ko.ttml` → `ko`).

Timestamp conversion: `HH:MM:SS.mmm → (HH * 3600) + (MM * 60) + SS.mmm`

Each cue becomes:

```json
{
  "language": "ko",
  "idx": 0,
  "begin": 83.456,
  "end": 87.89,
  "text": "안녕하세요 여러분"
}
```

- `idx`: 0-based sequential index (per language)
- `begin`/`end`: float seconds
- `text`: subtitle text (`<br />` → space, entities decoded, tags stripped)

---

## Stage 2: Correct Korean (optional)

Skip if manual subs were available. Only needed for auto-generated captions.

### When to correct

Auto-generated Korean subs often contain:

- Homophone errors (전원 instead of 전환)
- Word boundary mistakes (spacing errors)
- Missing or incorrect particles

### Approach

Use LLM with cross-reference subs (if available) as context. Process in chunks of ~20-30 cues to maintain context.

**Prompt guidance:**

- Provide the Korean auto-generated cues
- Provide corresponding English/Japanese manual subs (if available) as reference
- Ask LLM to correct transcription errors, fix spacing, and fix particles
- Output corrected cues in the same format (preserve idx, begin, end)
- Note significant corrections for transparency

---

## Stage 3: Translate (optional)

Skip if English subs were downloaded in stage 1. Only needed when no English sub exists.

### Approach

Use LLM to translate Korean cues to English. Process in chunks of ~20-30 cues.

**Prompt guidance:**

- Provide Korean cues with timestamps
- Generate natural English translations (not word-for-word)
- Preserve the same cue segmentation (same idx, begin, end)
- Output as English caption cues

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

- `youtubeId` (string, required)
- `title` (string, required)
- `channelName` (string, optional, default: "")
- `channelId` (string, optional, default: "")
- `duration` (integer, optional, default: 0)
- `language1` (string, optional, default: "ko")
- `language2` (string, optional, default: "en")

Returns the video row (includes `id` needed for subsequent calls). Upserts on `youtubeId` conflict.

Get video metadata from yt-dlp:

```bash
yt-dlp --print "%(id)s|%(title)s|%(channel)s|%(channel_id)s|%(duration)s" --skip-download "<URL>"
```

### 4b. Create captions

```
POST /api/createCaptions
```

```json
{
  "videoId": 1,
  "captions": [
    {
      "language": "ko",
      "idx": 0,
      "begin": 83.456,
      "end": 87.89,
      "text": "안녕하세요 여러분"
    },
    {
      "language": "ko",
      "idx": 1,
      "begin": 88.0,
      "end": 92.5,
      "text": "오늘은 명동에 왔습니다"
    }
  ]
}
```

- `videoId` (integer, required) — from createVideo response
- `captions` (array, required):
  - `language` (string) — "ko", "en", etc.
  - `idx` (integer) — 0-based index per language
  - `begin` (number) — start time in seconds
  - `end` (number) — end time in seconds
  - `text` (string) — subtitle text

Returns `{ inserted: number }`.

Push Korean and English captions as separate calls (or combine in one array).

---

## Stage 5: Extract vocab

Extract notable Korean vocabulary from the subtitle text.

### What is "notable"

- Intermediate level or above (skip basic greetings, particles, ultra-common verbs like 하다/가다/오다)
- Slang, colloquial expressions, internet-speak that textbooks don't teach
- Hanja-based words where etymology aids memorization
- Konglish or loanwords with interesting usage

### Output format

```markdown
| Korean   | English        | Hanja/Etymology | Context                         | Timestamp | Notes      |
| -------- | -------------- | --------------- | ------------------------------- | --------- | ---------- |
| 직진하다 | to go straight | 直進            | 한번 꽂히면 직진하는 스타일이라 | 1:00      | colloquial |
| 눈 호강  | eye candy      | 눈 + 豪强       | 여기 완전 눈 호강이다           | 3:45      | informal   |
```

### Column rules

- **Korean**: headword (dictionary form for verbs/adjectives)
- **English**: concise definition
- **Hanja/Etymology**: hanja for Sino-Korean, loanword origin (e.g. "Japanese ガチャ"), or "native" for pure Korean
- **Context**: one representative line from the subtitles
- **Timestamp**: `M:SS` format matching the caption cue
- **Notes**: register (formal/casual/slang), frequency in video, usage hints

### Ordering

Group by frequency (most frequent first). Aim for 15-30 words per video.

### Correction notes

If correcting auto-generated transcription errors (stage 2), note the original in the Notes column (e.g. "auto-sub had 전원").

---

## Stage 6: Review vocab (optional)

Present the vocab table to the user for curation. Chat-based review:

- "keep 1,3,5" — keep only rows 1, 3, 5
- "drop 2,4" — remove rows 2 and 4
- "keep all" — keep everything
- User can also edit individual entries (change translation, add notes)

Number rows starting from 1 for user reference.

---

## Stage 7: Push bookmarks

Map approved vocab entries to the bookmark schema and push.

### Field mapping

| Vocab column    | Bookmark field | Transform                                                  |
| --------------- | -------------- | ---------------------------------------------------------- |
| Korean          | `text`         | direct                                                     |
| English         | `translation`  | direct                                                     |
| Context         | `context`      | direct                                                     |
| Timestamp       | `timestamp`    | convert `M:SS` → float seconds                             |
| Hanja/Etymology | `notes`        | prepend to notes, e.g. "直進. colloquial"                  |
| Notes           | `notes`        | append after etymology                                     |
| —               | `videoId`      | from createVideo response                                  |
| —               | `captionId`    | look up from caption cues by matching timestamp (optional) |
| —               | `side`         | 0 (default — primary language side)                        |
| —               | `offset`       | 0 (default)                                                |
| —               | `status`       | "pending" (default)                                        |

### API call

```
POST /api/createBookmarks
```

```json
{
  "bookmarks": [
    {
      "videoId": 1,
      "text": "직진하다",
      "translation": "to go straight",
      "context": "한번 꽂히면 직진하는 스타일이라",
      "timestamp": 60.0,
      "notes": "直進. colloquial",
      "status": "pending"
    }
  ]
}
```

Returns `{ inserted: number }`.

---

## API reference (quick)

| Endpoint          | Key fields                                                         |
| ----------------- | ------------------------------------------------------------------ |
| `createVideo`     | youtubeId, title, channelName, channelId, duration, language1/2    |
| `createCaptions`  | videoId, captions[]{language, idx, begin, end, text}               |
| `createBookmarks` | bookmarks[]{videoId, text, translation, context, timestamp, notes} |
| `listVideos`      | limit, offset → {items, total}                                     |
| `getVideo`        | id → video + captionCounts                                         |
| `listBookmarks`   | videoId, status, limit, offset → {items, total}                    |
| `deleteVideo`     | id                                                                 |
| `deleteBookmark`  | id                                                                 |
| `updateBookmark`  | id, status?, translation?, notes?                                  |
