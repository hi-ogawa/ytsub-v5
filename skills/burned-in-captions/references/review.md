# Review

A review is a look back over a finished run. A person goes over the parts the run wasn't sure of on a local page, which shows the picture and plays the speech at each one, because a doubt written as prose can't be settled without both. A review polishes the track, but its main use is finding what the skill should do better, because each doubt the run settled wrong or couldn't settle points at a gap in the steps.

## Doubts

The page is built from the run's `doubts.json`. Each item has a time range, a group, and a one-line reason. Each group says why its items are on the page.

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

It holds both the doubts that remain and the ones the run settled, because a reviewer checks the settled ones too:

- reads with `[?]`
- reads with a `note`, with the judgment made on each
- omitted captions, with their reason
- ASR lines that no caption matches, after frames confirmed there is none
- judgment calls on `kind`
- corrections from assembly

Let each group's `why` say why its items are on the page, so that a reviewer understands without the run's context. For example, "A reader declined to transcribe these as song lyrics" says more than "Left out of the track". `frames` is optional, and without it the page shows up to three frames across the range.

If the run left no `doubts.json`, build one from its report and its reads.

## Build the page

Build the page, and serve it on localhost in the background, because the YouTube player on it needs an http origin:

```bash
uv run scripts/review.py video.webm --video-id <youtube-id> --asr ko.json3 --out review/
uv run python -m http.server 8765 --bind 127.0.0.1 --directory review
```

Give the user the URL. For each item, the page plays the range with sound and the track's captions drawn over the player, shows frames with the caption boxes, and lists the track next to the ASR. The user marks each item and pastes back the text from "Copy review".

## Act on the review

Sort each finding by where it belongs:

- **Track:** a fix to this video's captions. Apply it as a patch that runs after assembly, such as a script of edits matched by time and text, rather than by editing `captions.json` in place, so that rerunning the assembly keeps it. A fix that needs more frames, such as a closer crop of a card, goes to a new reader as in [Assemble and correct](../SKILL.md#5-assemble-and-correct).
- **Skill:** something the steps should have done differently, such as a fade-in that was read as its own caption. Say what the skill should do, with the items that show it, and group findings that share a cause. Draft these as issues for this skill, and file them once the user agrees.
- **Channel:** something true of this channel only, such as how it tags speakers. Add it to the channel record, if one is available.

Then drop the settled items from `doubts.json`, rebuild the page, and repeat while the user wants to. Stop the server when you finish.
