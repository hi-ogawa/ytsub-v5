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

### Fetch the Video Once

Each `yt-dlp` run fetches the video's page from YouTube again, and YouTube blocks a machine that sends too many with "Sign in to confirm you're not a bot". So fetch everything about the video in one run:

```bash
yt-dlp -J --skip-download "<URL>" > yt.json
```

`yt.json` holds the metadata, the subtitle tracks with their URLs, and the description. Read all of these from it with `jq`, and don't run `yt-dlp` again for anything already on disk. The only other run is the one that downloads the subtitles.

If `yt-dlp` answers "Sign in to confirm you're not a bot", stop and report it. Retrying keeps the machine blocked longer.

### Write Metadata

```bash
jq '{youtubeId: .id, title, channelName: .channel, channelId: .channel_id, duration, language1: "ko", language2: "en"}' yt.json > video.json
```

### List Available Subtitle Tracks

```bash
jq -r '"manual: \(.subtitles | keys | join(" "))",
  "automatic: \(.automatic_captions | keys | map(select(test("^(ko|en)"))) | join(" "))"' yt.json
```

The automatic captions include over a hundred machine translations, so the filter keeps the ko/en codes. Adjust it when targeting other languages (e.g. `^(ja|zh)`).

Note the exact language code of each track you need, such as `en-US` rather than `en`. When the Korean is auto-generated, also note the other manual tracks, such as `ja` and `zh`, because they help fix the Korean in Scenario B.

A row such as `ko-en` (Korean from English) is YouTube's machine translation of another track, not Korean speech recognition, so it doesn't count as a Korean source. Korean songs often have this: manual `en` and `ja` tracks and no Korean track at all, which is Scenario F.

The automatic captions can list the Korean speech recognition as `ko-orig` next to `ko`, so check which one it is before you download it.

### Caption Track IDs (vssId)

A `vssId` names a YouTube caption track, and a video's `vssId1` and `vssId2` name the tracks its rows were built from.

Creating a video through the [server API](server-api.md#replace-or-create-a-video) needs both ids. yt-dlp doesn't print them, but each track's URL carries the parts an id is made from: `kind=asr` adds the `a.` prefix, `lang` is the language code, and `tlang` marks a machine translation of that track into another language.

| URL parameters              | vssId       |
| --------------------------- | ----------- |
| `lang=en`                   | `.en`       |
| `kind=asr&lang=ko`          | `a.ko`      |
| `kind=asr&lang=ko&tlang=en` | `a.ko.t.en` |

This prints each track's yt-dlp code next to its vssId:

```bash
jq -r '
  def param($k): (capture("[?&]\($k)=(?<v>[^&]*)").v) // null;
  [.subtitles, .automatic_captions][] | to_entries[] | .key as $key | .value[]
  | select(.ext == "json3") | .url
  | (if param("kind") == "asr" then "a." else "." end) + param("lang")
    + (if param("tlang") then ".t.\(param("tlang"))" else "" end)
  | "\($key)\t\(.)"' yt.json | grep -E "^(ko|en)"
```

For a Korean video with manual English subtitles, the output includes:

```
en	.en
en	a.ko.t.en
ko	a.ko
ko	a.en.t.ko
ko-orig	a.ko
```

A yt-dlp code can stand for several tracks. Here `ko` covers the Korean ASR track and the translation of the English track into Korean, so read the id off the URL rather than the code.

### Download Subtitles

Download every track you need in one run, in json3 format. Pass each language code exactly as the list shows it. If a code doesn't match a track, such as `en` for a video whose English is `en-US`, yt-dlp skips it and reports no error.

```bash
# Here with English listed as en-US, and ja for fixing the Korean in Scenario B
yt-dlp --write-sub --write-auto-sub --sub-lang ko,en-US,ja --sub-format json3 --skip-download -o "%(id)s" "<URL>"
mv <id>.ko.json3 ko.json3
mv <id>.en-US.json3 en.json3
mv <id>.ja.json3 ja.json3
```

Where a code has both a manual and an automatic track, yt-dlp takes the manual one, which is the one to prefer. For a code that exists only among the automatic captions, it takes the automatic one.

### Get Official Lyrics (Songs)

For a song, the official lyrics beat any Korean track. Artist and label channels often post them in the video description:

```bash
jq -r .description yt.json > description.txt
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
| G: Burned-in    | picture   | either    | The transcript's speech is the ko text              |

For a song with official lyrics, use Scenario F even when a Korean track exists, because fixing auto-generated lyrics only guesses at what the lyrics already say. If auto-generated quality looks unsalvageable and there are no official lyrics, flag it, because a different video may be the better choice.

When the user asks to use the captions burned into the picture, read them with the [burned-in captions skill](../../burned-in-captions/SKILL.md) and use Scenario G, because the picture is a Korean source that the ASR is not.

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

In Scenario B, include the other manual tracks in the subtitle download, parse them too, and use them as evidence for the fixes. Japanese follows Korean clause by clause, and its kanji confirm Sino-Korean words, so `ja` often settles a fix that the English only hints at, such as 3초째 → 3회째 from 3回目. A Chinese track can name people that the other tracks leave out. Leave a fix out when no track supports it, because a person who can hear the audio should check those spots.

Watch also for a word the ASR doesn't know, because it can come back across the whole video, garbled differently each time. On one variety video, the slang 남찍사 came out as 남직, 남사, and 남택사 in four places, and fixing them row by row left two of them as 남찍. The ASR can also get such a word right once and garble it elsewhere, as with 추구미 in one line and 죽음미 in two others. Names, unit names, and recent slang are the usual cases. So before you fix row by row, look through the whole ASR for words like these, settle each one once from the other tracks or its clean spot, and spell it the same way in every row.

On variety shows, the English track can mix speech with the editor's on-screen captions, such as `[...]` notes, name cards, title cards, and the lyrics of background music. The ASR can also miss short lines entirely, so some English rows have no Korean speech. On one such video, dropping the rows with no Korean speech worked well.

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

### Use Burned-In Captions (Scenario G)

The burned-in captions skill returns a transcript of the video. Its `speech` entries are every spoken line, with the caption's text where the picture shows the line and the fixed ASR elsewhere, and its `other` entries are the editor's on-screen text that nobody says. Use each `speech` entry as a row's Korean, because the transcript has already reconciled the picture with the ASR. An entry with `omitted` has no text, because a reader declined to reproduce it, so take the Korean in its range from the ASR and fix it as in Scenario B.

An `other` entry has Korean that only the picture has, and a learner can pick from it. Rows must not overlap, because the caption list neither scrolls nor highlights overlapping rows well, so place each `other` entry by the speech it overlaps:

- Put it in the row of the speech it overlaps, in brackets after the speech, such as `좋아한다 해야지 거기 명물이잖아 [눈치 챙기자]`.
- When it spans two or more speech rows, join those rows into one if they read as one thought, such as `우리는 소인으로 해야 돼? 대인으로 해야 돼? [진짜 모름]`. Otherwise put it on the row it comments on.
- Leave it out when the speech already carries its text, such as a memo whose items someone reads aloud.
- Where no speech overlaps it, it becomes a row of its own.

Make each row read as what it is. A `speech` row holds only what is said, and anything else is in brackets so it doesn't read as a spoken line. Leave out rows a learner gains nothing from, and settle each case by these two rules.

Pair the rows with English as in Scenario B when there is a manual English track, or translate each row into English for `text2` as in Scenario D when there isn't.

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

Pick vocabulary from the Korean captions as [Pick & Fill](pick-fill.md) describes, fill in each word as [Vocab Fields](vocab-fields.md) describes, and save the picks as `bookmarks.json`:

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
    "notes": ""
  }
]
```

| Field        | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `captionIdx` | The `idx` of the row in `captions.json`                      |
| `side`       | 0 for a word in `text1` (Korean), 1 for a word in `text2`    |
| `offset`     | Character offset of `text` within the row's text on its side |
| `context`    | The row's text on the bookmark's side                        |

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
