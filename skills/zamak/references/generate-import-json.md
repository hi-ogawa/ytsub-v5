# Generate import.json From a YouTube Video

This guide builds an `import.json` for a video from its YouTube subtitles, with clean bilingual captions (ko/en) and curated vocab bookmarks. It works without the extension, so use it for seed fixtures or for a one-off import through the app's upload dialog.

| File             | Quality bar                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `video.json`     | Correct metadata (title, channel, duration)                           |
| `captions.json`  | Clean, well-segmented text1/text2 pairs where translations correspond |
| `bookmarks.json` | Notable vocab items with correct offsets                              |
| `import.json`    | Valid payload assembled from above                                    |

Work in a scratch directory.

## Fetch and Assess

### Download Metadata

```bash
yt-dlp --print '{"youtubeId":"%(id)s","title":"%(title)s","channelName":"%(channel)s","channelId":"%(channel_id)s","duration":%(duration)s,"language1":"ko","language2":"en"}' --skip-download "<URL>" > video.json
```

### List Available Subtitle Tracks

```bash
yt-dlp --list-subs --skip-download "<URL>" 2>&1 | grep -E "^\[info\]|^Language|^ko |^en |^en-US"
```

The full output is ~1000 lines (hundreds of auto-translated languages). The grep filter shows section headers and ko/en rows. Check which section each row falls under: `Available subtitles` (manual) vs `Available automatic captions` (auto-generated). Adjust the grep pattern if targeting other languages (e.g. `^ja|^zh`).

Note the exact language code of each track you need, such as `en-US` rather than `en`. When the Korean is auto-generated, also note the other manual tracks, such as `ja` and `zh`, because they help fix the Korean in Scenario B.

A row such as `ko-en` (Korean from English) is YouTube's machine translation of another track, not Korean speech recognition, so it doesn't count as a Korean source. Korean songs often have this: manual `en` and `ja` tracks and no Korean track at all, which is Scenario F.

### Download Subtitles

Prefer manual subs over auto-generated. Use json3 format, and pass the language code exactly as the list shows it. If the code doesn't match a track, such as `en` for a video whose English is `en-US`, yt-dlp downloads nothing and reports no error.

```bash
# Manual subs (preferred), here with English listed as en-US
yt-dlp --write-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
yt-dlp --write-sub --sub-lang en-US --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.en-US.json3 en.json3

# Auto-generated (fallback)
yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format json3 -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
```

### Get Official Lyrics (Songs)

For a song, the official lyrics beat any Korean track. Artist and label channels often post them in the video description:

```bash
yt-dlp --print description --skip-download "<URL>" > description.txt
```

If the description has none, Korean streaming services such as Melon carry them. They carry the studio version, though, and a live, solo, or remix upload can drop a verse or add a bridge. For those uploads, trust only the video's own description, or check the lyrics against the timed tracks line by line.

### Read the json3 Files

Turn each track into a list of cues with `begin` and `end` in seconds, such as `ko.json` and `en.json`:

```json
{ "begin": 25.585, "end": 29.489, "text": "꼬집어 봐 뜬 꿈인 것 같아" }
```

A json3 file has an `events` array. An event's text is its `segs[].utf8` joined together, and its time is `tStartMs` and `dDurationMs` in milliseconds. Skip events with no `segs` or no text. Some tracks show two lines at a time, so each event repeats the previous line before the new one, separated by `\n`. Take only the new line, because otherwise the same line lands in two cues and the rows stop pairing.

### Assess Source Quality

After fetching and parsing, determine which scenario applies:

| Scenario        | Ko source | En source | Approach                                            |
| --------------- | --------- | --------- | --------------------------------------------------- |
| A: Both manual  | manual    | manual    | Zip if aligned; otherwise LLM audit                 |
| B: Ko auto + En | auto      | manual    | Fix ko text using en as context, align to en timing |
| C: Ko manual    | manual    | —         | LLM translates ko → en                              |
| D: Ko auto only | auto      | —         | Fix ko text, then LLM translate                     |
| E: Neither      | —         | —         | Stop                                                |
| F: Lyrics + En  | lyrics    | manual    | Pair lyric lines with en cues, audit en             |

For a song with official lyrics, use Scenario F even when a Korean track exists, because fixing auto-generated lyrics only guesses at what the lyrics already say. If auto-generated quality looks unsalvageable and there are no official lyrics, flag it, because a different video may be the better choice.

## Produce captions.json

The goal is clean, well-segmented text1/text2 pairs where translations correspond.

### Zip Aligned Tracks First (Scenario A)

When both tracks are manual, they are often already one to one. If their cue counts match and each pair's `begin` agrees within about 0.5s, zip them into rows with the Korean timestamps, and `captions.json` is ready. Otherwise, fall back to the LLM merge.

### Merge With an LLM (Fallback or Scenarios B/C/D)

Use the parsed cues (`ko.json`, `en.json`) as reference material and produce `captions.json` directly. This is a translation auditing task:

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
- `>>` speaker markers, which should be removed
- Truncated words at cue boundaries

In Scenario B, download and parse the other manual tracks too, and use them as evidence for the fixes. Japanese follows Korean clause by clause, and its kanji confirm Sino-Korean words, so `ja` often settles a fix that the English only hints at, such as 3초째 → 3회째 from 3回目. A Chinese track can name people that the other tracks leave out. Leave a fix out when no track supports it, because a person who can hear the audio should check those spots.

### Pair Official Lyrics With the Timed Track (Scenario F)

Manual translation tracks for songs usually give one cue per lyric line, and the `en` and `ja` tracks tend to share timestamps. So the job is to put each lyric line on a cue, keeping the `en` timing and text. Count the lyric lines against the cues:

```bash
grep -cv '^\s*$' lyrics.txt   # after cutting description.txt down to the lyrics
jq length en.json
```

When the counts match, zip them, and check each row against `ja`, which follows the Korean line by line:

```bash
grep -v '^\s*$' lyrics.txt | jq -R . | jq -s . > ko-lines.json
jq --slurpfile k ko-lines.json \
  '[to_entries[] | {idx: .key, begin: .value.begin, end: .value.end, text1: $k[0][.key], text2: .value.text}]' \
  en.json > captions.json
```

When the counts differ, the description usually leaves out a repeated chorus line that the translator heard. Find it through `ja` and fill it in from the matching chorus, and tell the person running the task to check that spot by ear.

The translators worked from the Korean and can misread it, so audit `text2` as in Scenario A. For example, both tracks of one song translated 우리 서로의 이름을 묻어요 as "let's ask each other's names", but "ask" would conjugate as 물어요, so 묻어요 means "bury". English can also reorder a few lines, so that one cue's English belongs to its neighbor's Korean. Rewrite `text2` for those rows, or merge them.

### Output Format

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

Check that the text1/text2 pairs make sense together, and fix any misaligned rows.

## Pick Bookmarks

If the video already has bookmarks, re-anchor them instead, as described in [Re-anchor Existing Bookmarks](#re-anchor-existing-bookmarks).

Propose bookmark candidates (interesting vocab from the Korean captions) and save them as `bookmarks.json`.

### What Counts as Notable Vocab

- Intermediate level or above (skip basic greetings, particles, ultra-common verbs like 하다/가다/오다)
- Slang, colloquial expressions, internet-speak that textbooks don't teach
- Hanja-based words where etymology aids memorization (populate the `etymology` field with hanja characters and breakdowns)

Target ~1 bookmark per 10s of video duration (e.g. 3 min → ~18, 10 min → ~60). Err on the side of over-bookmarking, because the app has quick deletion for curation.

### Bookmark Fields

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

### Validate Offsets

Agents miscount character offsets, so check every bookmark against its row before you return it. Its `context` must be the row's text on the bookmark's `side`, and its `text` must be at its `offset` in that text. Compute the offset by searching the row for `text`, not by counting. A bookmark whose `text` isn't in its row at all points at the wrong row, so find the right one.

### Re-anchor Existing Bookmarks

When the video already has bookmarks, from an earlier export or in the app, keep them instead of picking new ones. The new rows are split differently, so each bookmark's old caption index means nothing. Find the row that now holds the bookmark's word, and write the bookmark to `bookmarks.json` with that row's `captionIdx`, its `side`, and its `text` as the row now spells it. A word you fixed changes too, such as 쌍거풀 → 쌍꺼풀. Then set `offset` and `context` from the new rows as [Validate Offsets](#validate-offsets) describes, and keep other fields, such as an `id`, as they are.

## Assemble import.json

```bash
jq -n --slurpfile c captions.json --slurpfile b bookmarks.json \
  '{video: input, captions: $c[], bookmarks: $b[]}' video.json > import.json
```

Import it through the app's upload dialog.
