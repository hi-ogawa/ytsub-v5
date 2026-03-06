---
name: ytsub
description: >-
  Given a YouTube URL, produce clean bilingual captions (ko/en) and curated
  vocab bookmarks as import.json.
---

# ytsub skill

Given a YouTube URL, produce clean bilingual captions (ko/en) and curated vocab bookmarks as `import.json`. The user imports via the app's upload UI.

## Target artifacts

Each step produces a file in `data/<id>/` for user review before proceeding.

| File             | Quality bar                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `video.json`     | Correct metadata (title, channel, duration)                           |
| `captions.json`  | Clean, well-segmented text1/text2 pairs where translations correspond |
| `bookmarks.json` | 10-20 notable vocab items with correct offsets                        |
| `import.json`    | Valid payload assembled from above                                    |

## File structure

```
./
├── SKILL.md              # this file
├── scripts/
│   ├── parse-json3.ts         # json3 → caption cues JSON
│   ├── check-alignment.ts    # check 1:1 cue alignment, merge if aligned
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

---

## Step 1: Fetch & assess

### Download metadata

```bash
mkdir -p ./data/<id> && cd ./data/<id>
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s,"language1":"ko","language2":"en"}' --skip-download "<URL>" > video.json
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

| Scenario        | Ko source | En source | Approach                                            |
| --------------- | --------- | --------- | --------------------------------------------------- |
| A: Both manual  | manual    | manual    | Try script merge; if unaligned, LLM audit           |
| B: Ko auto + En | auto      | manual    | Fix ko text using en as context, align to en timing |
| C: Ko manual    | manual    | —         | LLM translates ko → en                              |
| D: Ko auto only | auto      | —         | Fix ko text, then LLM translate                     |
| E: Neither      | —         | —         | Stop, ask user                                      |

**Inform the user** which scenario was detected and which subs are manual vs auto-generated before proceeding. If auto-generated quality looks unsalvageable (common with song lyrics), flag this — the user may want a different video.

---

## Step 2: Produce captions.json

The goal is clean, well-segmented text1/text2 pairs where translations correspond.

### Try script merge first (Scenario A)

When both ko and en subs are manual, check if they're already 1:1 aligned:

```bash
npx tsx ../../scripts/check-alignment.ts ko.json en.json > captions.json
```

If this succeeds (exit 0), the cues matched within 0.5s tolerance and `captions.json` is ready. Skip the LLM merge below and proceed to Step 3.

If it fails (count mismatch or timestamp drift), fall back to the LLM merge.

### LLM merge (fallback or Scenarios B/C/D)

Use the parsed cues (`ko.json`, `en.json`) as reference material and produce `captions.json` directly. This is a **translation auditing task**:

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
    "text1": "꼬집어 봐 뜬 꿈인 것 같아",
    "text2": "am I awake? or am I still dreaming"
  }
]
```

**Review:** Check alignment — do text1/text2 pairs make sense together? Flag any misaligned rows.

---

## Step 3: Pick bookmarks

Agent proposes bookmark candidates (interesting vocab from the Korean captions). User curates the list. Save as `bookmarks.json`.

### What is "notable" vocab

- Intermediate level or above (skip basic greetings, particles, ultra-common verbs like 하다/가다/오다)
- Slang, colloquial expressions, internet-speak that textbooks don't teach
- Hanja-based words where etymology aids memorization (populate the `etymology` field with hanja characters and breakdowns)

Target ~1 bookmark per 10s of video duration (e.g. 3 min → ~18, 10 min → ~60). Err on the side of over-bookmarking — the user has quick deletion UI for curation.

### Bookmark fields

| Field       | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| text        | Korean word as it appears in the subtitle                                      |
| translation | English meaning                                                                |
| captionIdx  | Index into merged captions (for timestamp/captionId)                           |
| side        | 0 = primary (ko), 1 = secondary (en)                                           |
| offset      | Character offset of the word within caption text                               |
| context     | The full caption line containing the word                                      |
| etymology   | Hanja/etymology (e.g. `迷路` or `非現實的; 비(non) + 현실(reality) + 적(adj)`) |
| notes       | Optional notes                                                                 |
| status      | "pending" or "learned"                                                         |

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
    "etymology": "",
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

## Step 4: Assemble import.json

Assemble the final payload from intermediate files:

```bash
cd ./data/<id>
jq -n --slurpfile c captions.json --slurpfile b bookmarks.json \
  '{video: input, captions: $c[], bookmarks: $b[]}' video.json > import.json
```

Hand `import.json` to the user. They import via the app's upload UI.
