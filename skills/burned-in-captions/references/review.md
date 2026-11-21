# Review

In a review, a person goes over a finished run's doubts on a local page, which shows the picture and plays the speech at each one. It finds what the skill should do better, and fixes the track along the way.

## Doubts

Collect the run's doubts into `doubts.json`, both the ones it left open and the ones it settled, because a doubt settled wrong shows a gap in the steps:

- reads with `[?]` or a `note`, from the readers' output, with the judgment the report gives for each
- omitted captions, from `captions.json`
- ASR lines that no caption matches, from the ASR against the track, with what the report says about them
- judgment calls on `kind`, corrections, and doubts left open, from the report

Each item has a time range, a group, and a one-line reason:

```json
{
  "groups": [
    {
      "title": "Partly legible text",
      "why": "Readers marked part of the text [?]. Check the words against the frame."
    }
  ],
  "items": [
    {
      "begin": 612.0,
      "end": 613.0,
      "group": "Partly legible text",
      "reason": "Large text fading in",
      "frames": [612.25, 612.5]
    }
  ]
}
```

Let each group's `why` say why its items are on the page in words a reviewer understands without the run's context, such as "A reader declined to transcribe these as song lyrics". `frames` is optional, and without it the page shows up to three frames across the range.

## Build the page

Build the page, and serve it on localhost in the background, because the YouTube player on it needs an http origin:

```bash
uv run scripts/review.py video.webm --video-id <youtube-id> --asr ko.json3 --out review/
uv run python -m http.server 8765 --bind 127.0.0.1 --directory review
```

Give the user the URL. For each item, the page plays the range with sound and the track's captions drawn over the player, shows frames with the caption boxes, and lists the track next to the ASR. The user marks each item and pastes back the text from "Copy review".

## Act on the review

Sort each finding by where it belongs:

- **Track:** a fix to this video's captions. Apply it as a patch that runs after assembly, such as a script of edits matched by time and text, so that rerunning the assembly keeps it. A fix that needs more frames, such as a closer crop of a card, goes to a new reader as in [Assemble and correct](../SKILL.md#5-assemble-and-correct).
- **Skill:** something the steps should have done differently, such as a fade-in that was read as its own caption. Say what the skill should do, with the items that show it, and group findings that share a cause. Draft these as issues for this skill, and file them once the user agrees.
- **Channel:** something true of this channel only, such as how it tags speakers. Add it to the channel record, if one is available.

Then drop the settled items from `doubts.json`, rebuild the page, and repeat while the user wants to. Stop the server when you finish.
