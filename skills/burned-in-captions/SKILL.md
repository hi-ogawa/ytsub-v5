---
name: burned-in-captions
description: Read the captions burned into a video's picture into a timed caption track. Use when the user asks to read a video's burned-in captions (자막), such as for Fix & Align ASR in the Zamak skill.
---

# Burned-In Captions

Many Korean variety shows, talk shows, and vlogs burn captions into the picture. This skill reads them into a timed track. Local scripts find where the picture changes, you decide which frames to read, and readers transcribe them with vision.

You need a shell with `ffmpeg`, `uv`, and `yt-dlp`. Work in a folder of your own, outside this skill, and run the scripts with `uv run --project`, which takes their dependencies from this skill's `pyproject.toml`. With `S` set to this skill's folder:

```bash
uv run --project $S $S/scripts/features.py video.webm > steps.csv
```

The commands below shorten this to `uv run scripts/...`. Outputs go to the folder you work in.

## Input and Output

**Input:** a video, as a YouTube ID or a file. Optionally, the video's ASR or other subtitle tracks, which help plan reads and check them, and a list of time ranges to read again (see [Reading Ranges Again](#reading-ranges-again)).

**Output:** `captions.json`, a list of captions in time order:

```json
{
  "begin": 12.5,
  "end": 14.25,
  "text": "진짜 몰랐어요??",
  "kind": "speech",
  "position": [470, 600, 340, 58]
}
```

- `kind` is `speech`, `commentary` (editor comments, often in brackets), or `label` (name cards and titles).
- `position` is the caption's box `[x, y, w, h]` in the 1280×720 frame.
- `text` is exactly what the picture shows, including nonstandard spelling, censored words such as ㅅㄲ, and spelled-out laughter.

## Read the Picture

Transcribe the picture, not the speech. Where a caption differs from the ASR, keep the caption's text exactly, and flag the difference instead of resolving it. Captions are worth reading because they differ: editors spell things their own way, censor swears, and fix what the ASR misheard. Never adjust a caption toward the ASR, or toward standard Korean.

Use any context that helps, such as the ASR's line timings to find caption changes, or a word the ASR heard to make out a small or blurred caption. A reader that had the ASR kept every caption that differed from it, and got one right that a reader without it misread.

Keep the reading sheets out of your own context where you can, by giving them to reader subagents, because a 21-minute video needs dozens of sheets.

## Steps

### 1. Check for captions

Download the video at 720p:

```bash
yt-dlp -f 247 -o 'video.%(ext)s' <youtube-id>
```

Look at one sheet of 20 frames spread across the whole video:

```bash
uv run scripts/frames.py video.webm --spread 20 --out check/
```

Decide whether the video has burned-in captions, and what style they are, such as white text with a dark outline, or text on a dark box.

- With no captions, return an empty track and say so.
- If a channel record is available and has notes on this channel, use them.
- If the captions have no dark around them, such as dark text on a light bubble, stop and report it. The scripts can't see that style, so it needs a code change.

### 2. Compute features

```bash
uv run scripts/features.py video.webm > steps.csv
```

This writes one row per 0.25 s step, about 5,100 rows and 1.1 MB for a 21-minute video, in about 3 minutes. It also finds overlays that stay on screen most of the video, such as the channel logo, drops them from the masks, and writes their boxes to `static.json`. Pass `--start` and `--dur` in seconds for a window. The columns are in [Features](#features).

The whole-frame columns also see scenery, so on a busy channel every camera cut can look like a caption change. Where the captions keep to fixed areas, such as a bar at the bottom and zones at the sides, pass each area as a region, and the table gets the same features for the letters inside it:

```bash
uv run scripts/features.py video.webm --region bar=180,570,920,95 --region left=0,290,460,160 > steps.csv
```

Find the areas from the check sheet, or from where `clusters_b` or `clusters_o` boxes keep turning up in a run over a short window. Region features use the box mask by default, and `--region-mask o` switches to the outline mask for outlined captions.

### 3. Plan reads

Load `steps.csv` and filter it with code, not row by row. Use the region columns where you have them. Look for steps where something changes, such as:

- `kept` drops, a swap
- `gone` and `new` spike while `scene` stays low, a swap in the same spot
- `new` grows while `gone` stays near zero, a reveal
- `kept_1s` or `kept_2s` falls slowly while `kept` stays high, a crossfade. Both also fall for 1–2 s after every swap, because they compare with a step from before it, so a slow fall means a crossfade only with no swap just before.

Group the steps between changes into runs, and match each run to a pattern in [the catalogue](references/catalogue.md). The pattern gives the reading rule, such as one late frame for a clean swap, or both sides of a spike for a swap in the same spot.

Write a read list. Each entry has a time, its run, and the pattern that led to it, so a later miss can be traced to a rule.

Read where you are unsure, and skip reads that would only repeat what you already know with confidence, such as a second frame of a steady run whose caption you have read, or a camera cut where the features and the ASR show the same caption going on. A miss costs more than a read, so skip only from confidence, never to save a fixed number of reads.

### 4. Read

```bash
uv run scripts/frames.py video.webm --at 12.25 12.5 12.75 --out sheets/
```

This tiles the frames into sheets of 20 full frames at 480×270, about 3,400 image tokens each, each labelled with its time, and prints each sheet's path with its times as JSON. Times round to the 0.25 s step grid. It takes the frames from the same 4 fps decode as `features.py`, because seeking to each timestamp sometimes returns the frame before.

Give the sheets to reader subagents, about 8 sheets each, because most of a reader's tokens are its own overhead. Use the strongest model available: a cheaper one added a fluent ending that wasn't on screen. Give each reader the ASR for its time range if you have it, with this instruction:

> Transcribe every caption in each frame exactly as shown, including nonstandard spelling, censored words, spelled-out laughter, and emoticons such as ㅠㅠ. The ASR is there to help you understand what is said. Where a caption differs from it, write what is on screen, never the ASR's words or standard Korean. Mark unclear or partial text with `[?]`. Return a JSON list with one entry per tile, including tiles with no caption: `{"t": <time>, "captions": [{"text": ..., "box": [x, y, w, h], "kind": "speech" | "commentary" | "label"}]}`, with boxes in the tile's 480×270 pixels.

Without subagents, read a few sheets per turn yourself.

### 5. Assemble and correct

Turn the reads into captions. Each caption takes its text from the reads, and its begin and end from the run it was read in. Take its position from the masks, not the reader's box: the region's `box` at that step, or the `clusters_b` or `clusters_o` box that overlaps the reader's box scaled up to the frame (× 1280/480). Text read in two neighboring runs becomes one caption. A half-revealed line becomes its fuller version.

Ask for more frames where something is off:

- a half line, or text cut at the edge of a tile
- the same text on both sides of a change, which means the read came too late
- a run with a change in the features but no new text
- an ASR line that no caption matches in time, on a show whose captions follow the speech
- readers who disagree on a caption's text

For small or unclear text, crop the frames to the caption's area. With `--crop`, `frames.py` tiles only that box, at twice the scale of a full-frame tile:

```bash
uv run scripts/frames.py video.webm --at 12.25 12.5 --crop 180,560,920,110 --out zoom/
```

Give the extra frames to a new reader, together with the frames already read from the same run and the runs next to it, so it can tell a reveal from a swap.

### 6. Record

If a channel record is available, add anything new about the channel to it: its style, what went wrong, and the windows you checked. Add new patterns to [the catalogue](references/catalogue.md). Tell the user what you changed, because the next video on the channel relies on it.

## Reading Ranges Again

A caller can pass time ranges where it suspects a miss, such as Fix & Align ASR passing the times of ASR lines that no caption matches. Read every other step in each range, and add the new captions to the track.

## Features

The scripts find letters with two masks, because each caption style needs its own. Both look for caption fill, white or saturated color, with dark around it.

- The outline mask (`_o`) wants dark within a few pixels. It fits outlined text, but on busy scenes it also picks up scenery.
- The box mask (`_b`) wants at least 30% dark within 11 px. It fits text on a dark box, but loses outlined text on bright backgrounds.

| Column                                                                                                       | Mask            | What it tells                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `t`                                                                                                          |                 | time in seconds                                                                                                                 |
| `letters`                                                                                                    | each            | letter pixels, which say whether there is a caption and how much text                                                           |
| `in_static`                                                                                                  | each            | letter pixels inside the dropped overlays, which show a caption partly erased by overlapping the logo                           |
| `kept`                                                                                                       | each            | share of the previous step's letters still there. A drop means a swap.                                                          |
| `kept_1s`, `kept_2s`                                                                                         | each            | the same against 1 s and 2 s back. A slow fall means a crossfade that `kept` misses. Both also fall for 1–2 s after every swap. |
| `gone`, `new`                                                                                                | each            | letter pixels that left, and that arrived. Both high means a swap, only `new` means a reveal.                                   |
| `scene`                                                                                                      |                 | change across the whole frame. A spike means a camera cut.                                                                      |
| `clusters_o`, `clusters_b`                                                                                   | each            | a JSON list of `[x, y, w, h]`, one box per group of letters, which shows positions and how many captions are on screen          |
| `letters_<region>`, `kept_<region>`, `kept_1s_<region>`, `kept_2s_<region>`, `gone_<region>`, `new_<region>` | `--region-mask` | the same features inside a region given with `--region`                                                                         |
| `box_<region>`                                                                                               | `--region-mask` | the box around the letters in the region, the caption's position                                                                |

Compare the masks yourself when one may be fooled by scenery, and track a cluster's box across rows to see how long it holds.
