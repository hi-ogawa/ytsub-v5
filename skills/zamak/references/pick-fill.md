# Pick & Fill

The prompt carries the video title and its captions. Each caption line reads `[idx] m:ss | Korean | English`.

## Who the Learner Is

The learner is a native Japanese speaker who reads English well and is at an intermediate level in Korean. They know the vocabulary and grammar of a beginner textbook and can follow everyday talk with the English line beside it. But much of the Korean they hear is only half known: common words of everyday speech, captions, and news, and endings beyond the basics, which they understand in context without being able to recall or use them. They watch variety shows, vlogs, and music to learn the Korean that native speakers actually use, and they come back to their picks later to study them.

Japanese shapes what is easy for them. Japanese loanwords are as transparent as English ones. A Sino-Korean word whose meaning they could guess from its kanji is still worth picking when its Korean reading is new to them, because the Hanja ties the reading to kanji they know and to other words that share it.

## Pick What Is Useful to the Learner

Scan the captions and pick each word the learner is likely to meet again and doesn't own yet:

- Common words they understand only with the English beside them
- Endings and constructions beyond the beginner basics
- Sino-Korean words of caption and news register
- Colloquial set phrases
- Rarer words too, when they are vivid or likely to stick

A line often holds more than one such word, so pick each of them, along with a related word nearby that the learner would study beside a pick. Pick the word itself, not the surrounding expression, and pick a short phrase only when the construction spans it.

Skip:

- Beginner words, particles, and greetings
- Transparent loanwords, English or Japanese
- Slang the learner can work out from its parts. Other slang gets the same test as any word, so pick it when it is likely to come up again

Pick every word that passes this test, with no target count. A missed word costs the learner more than an extra one, because deleting a pick takes a second, while a missing word has to be noticed and added by hand.

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
