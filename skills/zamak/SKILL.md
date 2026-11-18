---
name: zamak
description: Work on Zamak, an app for learning Korean from YouTube subtitles. Use when a Zamak AI prompt arrives, when the user asks for one of its tasks (Pick & Fill, Fill, or Fix & Align ASR), or to read or change their Zamak videos and bookmarks.
---

# Zamak

Zamak is an app for learning Korean from YouTube videos. It shows a video's Korean and English captions side by side, one row per line, and the user bookmarks words in the rows to study. An AI fills in each bookmark's meaning and origin, and it can also fix the captions themselves.

The app hands a task to the AI through a prompt that the user copies into a chat or an agent session. The prompt names the task and carries the video's data, and this skill describes the task. Links here are relative to this file, so resolve them against the URL you read it from.

## Tasks

| Task            | What it does                                                   | Result `type` |
| --------------- | -------------------------------------------------------------- | ------------- |
| Pick & Fill     | Picks vocabulary from the captions and fills it in             | `pick-fill`   |
| Fill            | Fills in the bookmarks the user made                           | `fill`        |
| Fix & Align ASR | Fixes auto-generated Korean and aligns it to an official track | `fix-asr`     |

Each task returns one JSON object of the shape shown below. The user imports it in the app, which reads its `type` to tell which task it belongs to.

Run the task the user asks for. When they name a task without pasting its prompt, such as "pick fill next" after a fix-asr, read the data it needs as [Read the Current Rows](#read-the-current-rows) describes.

### Pick & Fill

The prompt carries the video title and its captions. Each caption line reads `[idx] m:ss | Korean | English`.

Scan the captions and pick vocabulary worth learning:

- Words a Korean learner is unlikely to already know (from upper intermediate to TOPIK2 class vocabulary)
- Prefer single words over phrases. Pick the word itself, not the surrounding expression
- Skip beginner vocabulary, basic and common words (하다, 가다, 있다, particles, greetings), and transparent English loanwords (포인트, 스타일)
- Aim for 5-10 picks per ~150 captions. Prefer fewer quality picks over padding

If there are more than 150 captions, process ~150 at a time. After each batch, return its picks as one result, say where you stopped, and ask the user to say "continue".

```json
{
  "type": "pick-fill",
  "entries": [
    {
      "captionIndex": 4,
      "text": "체중",
      "translation": "body weight",
      "etymology": "體重 / 体重",
      "notes": "몸무게 (.syn:native)"
    },
    {
      "captionIndex": 12,
      "text": "어이없다",
      "translation": "absurd, dumbfounded",
      "etymology": "",
      "notes": ""
    }
  ]
}
```

- `captionIndex`: the `[idx]` of the caption line
- `text`: an exact substring of that line's Korean
- `translation`, `etymology`, `notes`: as [Vocab Fields](references/vocab-fields.md) describes

The app creates a bookmark for each entry. It skips an entry whose `captionIndex` is out of range or whose `text` isn't in that row's Korean, and lists the skipped entries.

### Fill

The prompt carries the video title, the bookmarks to fill, and the captions in the same format as Pick & Fill. Each bookmark has its `id`, its `text`, the `captionIndex` of its line, and that line's text.

Read the lines around each bookmark before filling it, because the sense, the Hanja, and any joke often depend on the scene rather than on that one line.

```json
{
  "type": "fill",
  "entries": [
    {
      "id": "abc-123",
      "translation": "to be confused",
      "etymology": "",
      "notes": ""
    }
  ]
}
```

- `id`: the bookmark's `id` from the prompt
- `translation`, `etymology`, `notes`: as [Vocab Fields](references/vocab-fields.md) describes

The app updates the bookmark with each `id`. These ids are local to the user's browser, so only the prompt carries them.

### Fix & Align ASR

This task needs an agent with a shell and `yt-dlp`. The video has no manual Korean track, so its Korean captions are auto-generated (ASR) or machine-translated from another track. Fix the Korean and align it to an official track, so each row pairs one Korean line with its English line.

The prompt carries:

- the video ID and title
- the tracks the app sees, each with its `vssId`, language, source (manual, ASR, or translated), and whether it is the current `text1` or `text2`. The app's list can miss official tracks, so check `yt-dlp --list-subs` too.
- the existing bookmarks. `captionIndex` points into the current rows, and `context` is the current row text, which shows where each word was before your changes. `side` is 0 for a Korean word and 1 for an English one.

Follow [Generate import.json](references/generate-import-json.md). Run "Fetch and Assess" to get the tracks, then produce `captions.json` as Scenario B describes. For a song with official lyrics, follow Scenario F instead. Instead of picking bookmarks, re-anchor the existing bookmarks to your new rows, as "Re-anchor Existing Bookmarks" describes, and keep each bookmark's `id` in `bookmarks.json`. Skip "Assemble import.json".

```json
{
  "type": "fix-asr",
  "captions": [{ "begin": 1.2, "end": 3.4, "text1": "...", "text2": "..." }],
  "bookmarks": [
    { "id": "...", "captionIndex": 5, "offset": 3, "text": "쌍꺼풀" }
  ]
}
```

- `captions`: the rows of `captions.json` in order, with `begin` and `end` in seconds
- `bookmarks`: the validated `bookmarks.json`, one entry for each existing bookmark, with `id`, `text`, `offset`, and `captionIdx` renamed to `captionIndex`. `text` is the word as it reads now, which can differ from before when you fixed it.

The app replaces all caption rows with yours and moves each bookmark to its new position. It rejects the whole result if any bookmark is missing or its `text` isn't at its `offset`.

## Read the Current Rows

A task without its prompt reads the video from the server with `videos/getFullSession`, as [Use the Server API](references/server-api.md) describes. Each caption's `idx` is its `captionIndex`. The server has the user's latest rows only after they push, so ask them to push first. After a fix-asr, for example, the new rows reach the server only once the user imports the result and pushes.

The server's bookmark ids differ from the app's, so a Fill result built from them doesn't import in the app. Apply it through the server API with `bookmarks/updateBookmark` instead, and tell the user to pull when you are done.
