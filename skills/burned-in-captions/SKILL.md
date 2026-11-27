---
name: burned-in-captions
description: Read the captions burned into a video's picture into a timed caption track. Use when the user asks to read a video's burned-in captions (자막), such as for Fix & Align ASR in the Zamak skill.
---

# Burned-In Captions

Many Korean variety shows, talk shows, and vlogs burn captions into the picture. This skill reads them into a timed track. Local scripts find where the picture changes, you decide which frames to read, and readers transcribe them with vision.

You need a shell with `ffmpeg`, `uv`, and `yt-dlp`. Work in a folder of your own, outside this skill, and run the scripts with `uv run --project`, which takes their dependencies from this skill's `pyproject.toml`. With `S` set to this skill's folder:

```bash
uv run --project $S $S/scripts/features.py video.webm > steps.jsonl
```

The commands below shorten this to `uv run scripts/...`. Outputs go to the folder you work in.

## Input and Output

**Input:** a video, as a YouTube ID or a file. Optionally, the video's ASR or other subtitle tracks, which help plan reads and check them, and a list of time ranges to read again (see [Reading Ranges Again](#reading-ranges-again)).

**Output:** `captions.json`, the track that Fix & Align ASR in the [Zamak skill](../zamak/SKILL.md) takes. It is a list of captions in time order:

```json
{
  "begin": 12.5,
  "end": 14.25,
  "text": "진짜 몰랐어요??",
  "kind": "speech",
  "position": [470, 600, 340, 58]
}
```

- `kind` is `speech` for words someone says, and `other` for anything else the editor put on screen, whatever its frame. Fix & Align ASR uses a `speech` caption's text in place of the ASR's line at the same time, and turns `other` captions into rows as [Scenario G](../zamak/references/generate-import-json.md#use-burned-in-captions-scenario-g) describes. So tag a caption `speech` when someone in the video says its words aloud at that time, and use the ASR at that time to check. That includes a letter someone reads aloud, and a small popup beside a second speaker who talks over the first. Text filmed in the scene, such as signs, isn't a caption, so leave it out.
- `position` is the caption's box `[x, y, w, h]` in the 1280×720 frame.
- `text` is exactly what the picture shows, including nonstandard spelling, censored words such as ㅅㄲ, and spelled-out laughter.
- `omitted` is a short reason, set on a caption whose text a reader declined to reproduce, such as copyrighted text. Its `text` is empty, and it keeps its time and position, so a user can fill it in by hand. Text that is only hard to read is not omitted, so mark it with `{?}` or read it again. Never put a placeholder label in `text` instead, because Fix & Align ASR would use the label as the caption's text.

## Read the Picture

Transcribe the picture, not the speech. Where a caption differs from the ASR, keep the caption's text exactly. Captions are worth reading because they differ: editors spell things their own way, censor swears, and fix what the ASR misheard. Never adjust a caption toward the ASR, or toward standard Korean.

Use any context that helps, such as the ASR's line timings to find caption changes, or a word the ASR heard to make out a small or blurred caption. A reader that had the ASR kept every caption that differed from it, and got one right that a reader without it misread.

Keep the reading sheets out of your own context where you can, by giving them to reader subagents, because a 21-minute video needs dozens of sheets.

## Steps

### 1. Check for captions

Download the video at 720p into a folder kept for that video, such as one named after its ID:

```bash
yt-dlp -f 247 -o 'video.%(ext)s' <youtube-id>
```

Download it once, and reuse the file for reruns, follow-ups, and [Reading Ranges Again](#reading-ranges-again). Each download is a request to YouTube, and YouTube blocks a machine that sends too many with "Sign in to confirm you're not a bot". If `yt-dlp` answers with that, stop and report it, because retrying keeps the machine blocked longer.

Other `yt-dlp` failures, such as HTTP 403, usually mean the installed `yt-dlp` is out of date, because YouTube changes often. Retry once with the latest release through `uvx yt-dlp@latest` before giving up.

When the task needs only part of the video, download only that part:

```bash
yt-dlp -f 247 --download-sections '*600-780' --force-keyframes-at-cuts -o 'video-600.%(ext)s' <youtube-id>
```

The file starts at 0 s, so add the section's start to every time the scripts print or take. `--force-keyframes-at-cuts` makes the cut land exactly on the start, which a plain cut misses by up to a few seconds.

If you weren't given the subtitle tracks, fetch them as [Fetch and Assess](../zamak/references/generate-import-json.md#fetch-and-assess) describes, because planning checks against them.

Look at one sheet of 20 frames spread across the whole video:

```bash
uv run scripts/frames.py video.webm --spread 20 --out check/
```

Decide whether the video has burned-in captions, and what style they are, such as white text with a dark outline, or text on a dark box. Note also how easily the captions read at this tile size, which guides the tile size for reading in step 4.

- With no captions, return an empty track and say so.
- If a channel record is available and has notes on this channel, use them.
- If the captions have no dark around them, such as dark text on a light bubble, stop and report it. The scripts can't see that style, so it needs a code change.

### 2. Compute features

```bash
uv run scripts/features.py video.webm > steps.jsonl
```

This writes one JSON object per line for each 0.25 s step, about 5,100 lines and 2 MB for a 21-minute video, in about 3 minutes. It also finds overlays that stay on screen most of the video, such as the channel logo, drops them from the masks, and writes their boxes to `static.json`. Pass `--start` and `--dur` in seconds for a window. The keys are in [Features](#features).

The whole-frame features also see scenery, so on a busy channel every camera cut can look like a caption change. Where the captions keep to fixed areas, such as a bar at the bottom and zones at the sides, pass each area as a region, and each step gets the same features for the letters inside it:

```bash
uv run scripts/features.py video.webm --region bar=160,590,960,90 --region left=0,300,420,150 > steps.jsonl
```

Find the areas from the check sheet, or from where `clusters_b` or `clusters_o` boxes keep turning up in a run over a short window. Region features use the box mask by default, and `--region-mask o` switches to the outline mask for outlined captions.

### 3. Plan reads

Filter `steps.jsonl` with code, not line by line. Use `jq` for quick looks:

```bash
jq -c 'select(.kept_bar < 0.7 and .gone_bar > 500) | [.t, .kept_bar, .box_bar]' steps.jsonl
```

A missing key reads as `null` in `jq`, which compares below every number, so pair a `<` test with a test that a missing value fails, as `.gone_bar > 500` does here. Build runs with a Python script and the standard `json` module, because grouping change steps needs state across steps.

Use the region keys where you have them. Look for steps where something changes, such as:

- `kept` drops, a swap
- `gone` and `new` spike while `scene` stays low, a swap in the same spot
- `new` grows while `gone` stays near zero, a reveal
- `kept_1s` or `kept_2s` falls slowly while `kept` stays high, a crossfade. Both also fall for 1–2 s after every swap, because they compare with a step from before it, so a slow fall means a crossfade only with no swap just before.

Group the steps between changes into runs. [The catalogue](references/catalogue.md) lists what common signatures usually mean, such as a swap or a reveal, which helps decide where a run's caption can be read. Treat it as a starting point, and let the frames and the tracks settle a doubt. A run's read comes before the next change, never on the frame after it, because that frame already shows the next caption.

Check the plan against the subtitle tracks first, because their text costs far less than frames. Look at frames only where the tracks can't settle a doubt, such as editor text, which no track contains, or a scene type you haven't seen yet, by tiling a few there and reading them yourself. Rerun the features on a window with `--start` and `--dur` between looks when a setting needs to change. A few sheets is usually enough. Stop once what you see agrees with the plan. Where a stretch stays unclear, such as scenery the masks keep reading as text, read it at a fixed interval instead, or accept some misses there and say so. Reading every caption precisely isn't the goal.

Write a read list. Each entry has a time, its run, and why it was planned, so a later miss can be traced back to its reason.

Read where you are unsure, and skip reads that would only repeat what you already know with confidence, such as a second frame of a steady run whose caption you have read, or a camera cut where the features and the ASR show the same caption going on. Skip only from confidence, never to save a fixed number of reads.

### 4. Read

```bash
uv run scripts/frames.py video.webm --at 12.25 12.5 12.75 --out sheets/
```

This tiles the frames into sheets, each tile labelled with its time, and prints each sheet's path, times, `scale`, and crop `origin` as JSON. Times round to the 0.25 s step grid. It takes the frames from the same 4 fps decode as `features.py`, because seeking to each timestamp sometimes returns the frame before.

Choose the tile size with `--scale`, so that this video's captions read comfortably, judging from the check sheet, which uses the default of 0.375, or 480×270 tiles. A sheet costs about 3,400 image tokens whatever is on it, so smaller tiles fit more frames per sheet.

If the captions keep to a band and look small in full-frame tiles, also give readers a padded crop of that band with `--crop`, next to the full frames. The band is usually the area found for the regions in step 2. Text outside the band still needs the full frames, such as a short popup beside a second speaker. Crop and full-frame sheets hold different numbers of tiles, so a reader pairs them by the time on each tile, not sheet by sheet. For example, on one travel channel, 480 px full-frame tiles were borderline for the dialogue line, and a crop of the caption band at 0.75 scale read cleanly.

Give the sheets to reader subagents, with enough sheets per reader that its fixed overhead is small next to its reading. Start each reader's batch with the last tile of the batch before it, so a reader can link a caption across the boundary. Use the strongest model available: a cheaper one added a fluent ending that wasn't on screen. Give each reader the ASR for its time range if you have it, with this instruction:

> Transcribe every caption in each frame exactly as shown, including nonstandard spelling, censored words, spelled-out laughter, and emoticons such as ㅠㅠ. The ASR is there to help you understand what is said. Where a caption differs from it, write what is on screen, never the ASR's words or standard Korean. Mark unclear or partial text with `{?}`.
>
> Tag each caption `speech` if it is words someone says, and `other` for anything else the editor put on screen. Words someone says can show outside the main dialogue line too, such as a small caption beside a second speaker who talks over the first, so tag those `speech` as well. Skip text filmed in the scene, such as signs, and list what you skipped in the tile's `skipped`, with the reason.
>
> Add a `note` to a caption, in your own words, whenever something about it could change how it goes into the track, including how it relates to other captions or to the speech. For example, the caption isn't fully shown in this frame, it is the same caption as in another tile (give that tile's time), its text is too small or unclear to read at this size, it comes from footage other than this video's own editing, the dialogue line is reading its items aloud one by one, or it is a dense graphic such as a card of reviews and ratings. Most captions need no note.
>
> If you won't reproduce a caption's text, such as copyrighted text, return the caption with empty text and a short reason in `omitted`, rather than a placeholder in `text`.
>
> Return a JSON list with one entry per tile, including tiles with no caption: `{"t": <time>, "captions": [{"text": ..., "box": [x, y, w, h], "kind": "speech" | "other", "note"?: ..., "omitted"?: ...}], "skipped"?: [{"text": ..., "reason": ...}]}`, with boxes in the pixels of the full-frame tile, or of the crop tile where a time has no full-frame tile.

Without subagents, read a few sheets per turn yourself.

### 5. Assemble and correct

Turn the reads into captions:

- Each caption takes its text from the reads, and its begin and end from the run it was read in.
- Take its position from the reader's box, converted to the frame with its sheet's printed `scale` and `origin`: divide by the scale, then add the origin. The mask boxes can't stand in for it, because on busy scenes they stretch over scenery that passes for letters, and `position` only needs to show where the caption is.
- Identical text read in neighboring runs becomes one caption.
- A caption with `omitted` keeps its run's time and position like any other, and neighboring ones with the same reason in the same place become one.

Reads with a `note` or a `{?}` need judgment. Judge each one together with the reads of the runs on either side: merge it into a neighbor, keep it as its own caption, drop it, or read it again from a later step or a closer crop, with a one-line reason. Look at the reads in full and in time order, so a caption that stays on screen sits next to the captions that change under it.

- A read of a caption that isn't fully shown merges into the read of the same caption once it settles.
- Text too small or unclear to read gets read again from a closer crop.
- Text from other footage stays only if it belongs in this video's track.
- A graphic that stays on screen while the dialogue line reads its items aloud one by one keeps its own `other` caption, because the track records the picture. The speech captions carry its content, so Fix & Align ASR leaves it out of the rows.
- A dense graphic, such as a card with three reviews, star ratings, and a summary, isn't worth a caption for each element. Drop it, and list it in the report. A letter or memo read aloud isn't dense in this sense, because its text is the speech.
- A caption with no letters, such as a line of dots or an editor's `[???]`, stays out of the track, and the report lists it. As `speech` it would replace the ASR's words with punctuation, and as `other` it would become a row with nothing to read. A read that is all `{?}` is different, because its text is unclear rather than missing, so read it again.
- The note is the reader's own description of what it saw, so let it decide over how similar two texts look, because two different lines can differ by a single word. Fall back to text similarity only where neither a note nor identical text links two reads.

A merge keeps the fuller read's text and spans both runs, so a fade-in read merged into its steady caption gets the right begin. Timing always comes from the runs, never from the judgment. Give the reads to do again to a new reader as described below, and treat the new reads the same way.

Ask for more frames where something is off:

- a half line, or text cut at the edge of a tile
- the same text on both sides of a change, which means the read came too late
- a run with a change in the features but no new text
- an ASR line, or a cue of another subtitle track such as `en`, that no caption matches in time, on a show whose captions follow the speech
- a speech caption whose span holds clearly more ASR speech than its text. The next line most likely replaced it in the same spot, which the features can miss under a still camera, so the read saw only the later line. Compare each speech caption with the ASR words under its span in a script, and read the flagged spans again every other step. On one variety show this found 21 lost lines, most of them about a second long. It can't find a line that the ASR also missed, such as a short popup over someone else's speech.
- readers who disagree on a caption's text

Stop when a round of corrections finds little that's new, and list the doubts that remain in your report instead of chasing each one. The report also lists each omitted range, each judgment, and each correction, with its time and its reason, so that a later [review](references/review.md) can find them.

For small or unclear text, crop the frames to the caption's area. With `--crop`, `frames.py` tiles only that box, at a scale of 0.75 unless `--scale` says otherwise:

```bash
uv run scripts/frames.py video.webm --at 12.25 12.5 --crop 160,580,960,110 --out zoom/
```

Give the extra frames to a new reader, together with the frames already read from the same run and the runs next to it, so it can tell a reveal from a swap.

### 6. Record

If a channel record is available, add anything new about the channel to it: its style, how closely its captions follow the speech, what went wrong, and the windows you checked. Add a feature signature to [the catalogue](references/catalogue.md) only when it took real effort to decode. Tell the user what you changed, because the next video on the channel relies on it.

## Reading Ranges Again

The user or the Zamak skill can pass time ranges where it suspects a miss, such as Fix & Align ASR passing the times of ASR lines that no caption matches. Read every other step in each range, put the new reads through [Assemble and correct](#5-assemble-and-correct), and add the new captions to the track.

## Reviewing a Run

When the user wants to look back over a finished run, mostly to find what this skill should do better, follow [Review](references/review.md).

## Features

The scripts find letters with two masks, because each caption style needs its own. Both look for caption fill, white or saturated color, with dark around it.

- The outline mask (`_o`) wants dark within a few pixels. It fits outlined text, but on busy scenes it also picks up scenery.
- The box mask (`_b`) wants at least 30% dark within 11 px. It fits text on a dark box, but loses outlined text on bright backgrounds.

| Key                                                                                                          | Mask            | What it tells                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `t`                                                                                                          |                 | time in seconds                                                                                                                 |
| `letters`                                                                                                    | each            | letter pixels, which say whether there is a caption and how much text                                                           |
| `in_static`                                                                                                  | each            | letter pixels inside the dropped overlays, which show a caption partly erased by overlapping the logo                           |
| `kept`                                                                                                       | each            | share of the previous step's letters still there. A drop means a swap.                                                          |
| `kept_1s`, `kept_2s`                                                                                         | each            | the same against 1 s and 2 s back. A slow fall means a crossfade that `kept` misses. Both also fall for 1–2 s after every swap. |
| `gone`, `new`                                                                                                | each            | letter pixels that left, and that arrived. Both high means a swap, only `new` means a reveal.                                   |
| `scene`                                                                                                      |                 | change across the whole frame. A spike means a camera cut.                                                                      |
| `clusters_o`, `clusters_b`                                                                                   | each            | a list of `[x, y, w, h]`, one box per group of letters, which shows positions and how many captions are on screen               |
| `letters_<region>`, `kept_<region>`, `kept_1s_<region>`, `kept_2s_<region>`, `gone_<region>`, `new_<region>` | `--region-mask` | the same features inside a region given with `--region`                                                                         |
| `box_<region>`                                                                                               | `--region-mask` | the box around the letters in the region                                                                                        |

A step leaves out a key that has no value, such as `kept` on the first step, or `box_<region>` when the region has no letters. Compare the masks yourself when one may be fooled by scenery, and track a cluster's box across steps to see how long it holds.
