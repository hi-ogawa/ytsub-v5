# Fix & Align ASR

This task needs an agent with a shell and `yt-dlp`. The video has no manual Korean track, so its Korean captions are auto-generated (ASR) or machine-translated from another track. Fix the Korean and align it to an official track, so each row pairs one Korean line with its English line.

The prompt carries:

- the video ID and title
- the tracks the app sees, each with its `vssId`, language, source (manual, ASR, or translated), and whether it is the current `text1` or `text2`. The app's list can miss official tracks, so check `yt-dlp --list-subs` too.
- the existing bookmarks. `captionIndex` points into the current rows, and `context` is the current row text, which shows where each word was before your changes. `side` is 0 for a Korean word and 1 for an English one.

Follow [Generate import.json](generate-import-json.md). Run "Fetch and Assess" to get the tracks, then produce `captions.json` as Scenario B describes. For a song with official lyrics, follow Scenario F instead. Instead of picking bookmarks, re-anchor the existing bookmarks to your new rows, as "Re-anchor Existing Bookmarks" describes, and keep each bookmark's `id` in `bookmarks.json`. Skip "Assemble import.json".

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
