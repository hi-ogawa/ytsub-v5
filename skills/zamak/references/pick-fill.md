# Pick & Fill

The prompt carries the video title and its captions. Each caption line reads `[idx] m:ss | Korean | English`.

## Pick What Is Useful to the Learner

The learner is an intermediate Korean learner whose first language is Japanese. Judge the sense, not the word. A basic word qualifies in a sense or form the learner hasn't met, such as 타다 for winning a prize or 포기 as the counter for heads of cabbage, but not in its core sense. Scan the captions and pick each word they are likely to meet again and don't own yet:

- Basic words in a sense or form they haven't met
- Bound nouns, such as 차 in 12년 차 and 채 in 낀 채로
- Idioms and set phrases, including four-character idioms
- Ideophones, such as 실룩실룩 and 울컥
- Native words with a nuance to work out, such as 덩달아 and 고스란히
- Sino-Korean words of caption and news register, which mostly appear in editor captions, including ones whose meaning the kanji gives away but whose reading is new. Watch for a homophone whose hanja differs from the obvious one, such as 대형 as 隊形 rather than 大型
- Less common words of a field, such as 자작곡 and 회차 in music
- Rarer words too, when they are vivid or likely to stick

Pick words, not endings. A pick is the word as it appears in the row, so it carries the row's ending, and the Fill breaks that ending down. Pick a construction on its own only when no content word in the row carries it, such as 뻔했어.

A line often holds more than one such word, so pick each of them, but pick one word per phrase, such as 활약 from 활약이 펼쳐지는지. Pick a word again where it comes back later in the video, but not within the same exchange or in a cold open that repeats later lines. Pick the word itself, not the surrounding expression, and pick a short phrase only when the construction spans it.

Skip:

- Basic words in their core sense, such as 공연, 늘다, 당장, and 살짝, and particles and greetings
- Everyday Sino-Korean in speech, such as 회식, 진행, and 불참
- Everyday words of a field, such as 작곡, 음원, 발매, 연습생, and 최애
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
