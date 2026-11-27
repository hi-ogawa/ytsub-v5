# Pick & Fill

The prompt carries the video title and its captions. Each caption line reads `[idx] m:ss | Korean | English`.

## Pick What Is Useful to the Learner

The learner is an upper-intermediate Korean learner whose first language is Japanese. They follow everyday conversation and own its common words and endings. Scan the captions and pick each word they are likely to meet again and don't own yet:

- Words of everyday speech a step past daily conversation, which they half know
- Endings and constructions past the common ones of conversation
- Sino-Korean words of caption and news register, including ones whose meaning the kanji gives away but whose reading is new
- Colloquial set phrases whose meaning the words don't give away
- Rarer words too, when they are vivid or likely to stick

A line often holds more than one such word, so pick each of them. Pick each word once per video. Pick it again only when a later line uses it in a new sense or form that passes the test on its own. Pick the word itself, not the surrounding expression, and pick a short phrase only when the construction spans it.

Skip:

- Words and endings of daily conversation, particles, and greetings
- Transparent loanwords, English or Japanese
- Slang and internet coinages that don't pass the test. Slang is not notable in itself, so judge it like any other word

Pick every word that passes this test, with no target count. Before you add a pick, ask whether this learner already owns the word, because each pick they own is one more to delete, and many of them bury the words worth studying.

## Return the Picks

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
