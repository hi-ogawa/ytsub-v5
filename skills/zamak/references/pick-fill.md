# Pick & Fill

The prompt carries the video title and its captions. Each caption line reads `[idx] m:ss | Korean | English`.

Scan the captions and pick vocabulary worth learning:

- Words a Korean learner is unlikely to already know (from upper intermediate to TOPIK2 class vocabulary)
- Words whose endings or constructions a learner at that level is unlikely to know
- Pick the word itself, not the surrounding expression. Pick a short phrase only when the construction spans it
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
    },
    {
      "captionIndex": 20,
      "text": "헤매듯",
      "translation": "as if wandering lost (헤매다)",
      "etymology": "",
      "notes": "헤매- + -듯 (as if). Also figurative: struggle, be at a loss"
    }
  ]
}
```

- `captionIndex`: the `[idx]` of the caption line
- `text`: an exact substring of that line's Korean
- `translation`, `etymology`, `notes`: as [Vocab Fields](vocab-fields.md) describes

Before you return, check that each `text` is in the Korean of its `captionIndex` row, because an index that is off by one is easy to make and nothing else catches it.

The app creates a bookmark for each entry. It skips an entry whose `captionIndex` is out of range or whose `text` isn't in that row's Korean, and lists the skipped entries.
