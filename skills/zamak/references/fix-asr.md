# Fix & Align ASR

This task needs an agent with a shell and `yt-dlp`. The video has no manual Korean track, so its Korean captions are auto-generated (ASR) or machine-translated from another track. Fix the Korean and align it to an official track, so each row pairs one Korean line with its English line.

The prompt carries:

- the video ID and title
- the tracks the app sees, each with its `vssId`, language, source (manual, ASR, or translated), and whether it is the current `text1` or `text2`. The app's list can miss official tracks, so check `yt-dlp --list-subs` too.
- the existing bookmarks. `captionIndex` points into the current rows, and `context` is the current row text, which shows where each word was before your changes. `side` is 0 for a Korean word and 1 for an English one.

Follow [Generate import.json](generate-import-json.md). Run "Fetch and Assess" to get the tracks, then produce `captions.json` as Scenario B describes. For a song with official lyrics, follow Scenario F instead. When the picture has burned-in Korean captions, read them too, as [Burned-In Captions](#burned-in-captions) describes. Instead of picking bookmarks, re-anchor the existing bookmarks to your new rows, as "Re-anchor Existing Bookmarks" describes, and keep each bookmark's `id` in `bookmarks.json`. Skip "Assemble import.json".

```json
{
  "type": "fix-asr",
  "captions": [{ "begin": 1.2, "end": 3.4, "text1": "...", "text2": "..." }],
  "bookmarks": [
    { "id": "...", "captionIndex": 5, "offset": 3, "text": "쌍꺼풀" },
    {
      "captionIndex": 8,
      "offset": 0,
      "text": "어이없다",
      "translation": "absurd, dumbfounded",
      "etymology": "",
      "notes": ""
    }
  ]
}
```

- `captions`: the rows of `captions.json` in order, with `begin` and `end` in seconds
- `bookmarks`: the `bookmarks.json` that passed the offset check, one entry for each existing bookmark, with `id`, `text`, `offset`, and `captionIdx` renamed to `captionIndex`. `text` is the word as it reads now, which can differ from before when you fixed it.

When the user also asks for vocabulary, pick it from your new rows as [Pick & Fill](pick-fill.md) describes, and add each pick to `bookmarks` without an `id`. A new entry has `captionIndex`, `offset`, `text`, `side` (0 for Korean, the default), and the `translation`, `etymology`, and `notes` that [Vocab Fields](vocab-fields.md) describes. Check its offset the same way as for the existing bookmarks.

The app replaces all caption rows with yours, moves each existing bookmark to its new position, and adds the new ones. It rejects the whole result if any existing bookmark is missing or any entry's `text` isn't at its `offset`.

## Burned-In Captions

Many Korean videos with only ASR burn captions into the picture. Read them with the [burned-in captions skill](../../burned-in-captions/SKILL.md), which also needs `ffmpeg` and `uv`, and use the track as one more source, or on some shows as the Korean text itself.

1. **Read the captions.** After Fetch and Assess, run the burned-in captions skill with the video and its ASR. The ASR helps it plan reads and find misses, and its readers keep the caption's text wherever it differs from the ASR.
2. **Decide how to use them.** Measure the share of ASR lines that a caption matches in time and text, or take it from the channel record, if one is available.
   - **Near-verbatim captions,** as on 노빠꾸탁재훈, become the Korean text and its segmentation. The ASR is evidence for lines the captions skip.
   - **Commentary-heavy captions,** as on 조현영's vlog, are evidence for fixing the ASR, the way a `ja` track is in Scenario B. Commentary and labels aren't speech, so they never become rows of their own.
3. **Find misses.** With near-verbatim captions, an ASR line that no caption matches in time points to a missed caption. The skill checks for these itself, and you can pass any it left as ranges to read again.
4. **Merge,** then align, re-anchor the bookmarks, and return the result as usual. Keep the caption text as shown, including censored swears (ㅅㄲ) and spelled-out laughter, because that is what the viewer sees, and the ASR is the weaker source.
5. **Record** whether the channel's captions are near-verbatim in the channel record, if one is available, so the next video on the channel skips the measurement.

## Write the Result to the Server

When the user asks you to apply the result yourself instead of returning it, write the whole video with `videos/importVideo`, as [Use the Server API](server-api.md#replace-or-create-a-video) describes. Send `captions.json` rather than the result's `captions`, because `importVideo` needs each row's `idx`. It also recreates the bookmarks, so send `bookmarks.json`, with each bookmark's `captionIdx` and the rest of its fields rather than an `id`.

- When the server has the video, ask the user to push first, so the server holds their latest bookmarks. Take each bookmark's `translation`, `etymology`, and `notes` from `getFullSession`, and keep the video's `vssId1` and `vssId2`.
- When it doesn't, create it. If the prompt lists bookmarks, though, ask the user to push first instead, because the prompt leaves out their translations and the pull would replace them with your copy. Take the metadata from "Download Metadata" in [Generate import.json](generate-import-json.md), and `vssId1` and `vssId2` from "Caption Track IDs (vssId)" there.

Either way, tell the user to pull when you're done.
