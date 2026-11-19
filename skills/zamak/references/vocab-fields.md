# Vocab Fields

Pick & Fill and Fill Bookmarks both return these three fields for each word.

## translation

The English meaning in this caption, not a dictionary dump. Keep it concise. When the word is inflected, end with its dictionary form in parentheses, such as `as if wandering lost (헤매다)` for 헤매듯, so the learner can look it up.

## etymology

The word's origin or structure when it helps learning, otherwise an empty string. Use a minimal format with no explanations:

- Sino-Korean: Hanja, followed by Japanese kanji when they differ (`價格 / 価格`, `希望`)
- auxiliary verb compounds: `잊다 + 버리다`
- passive, causative, and nominalization: `듣다 + 리 (passive)`, `웃다 + 기 (causative)`, `걷다 + 음 (nominalization)`
- compounds, with each root before sound change: `개 + 아지` for 강아지, `갈비 + 湯` for 갈비탕
- loanwords, with the borrowing path: `computer`, `アルバイト / Arbeit`
- contractions: the full form, such as `아이` for 애

Leave it empty for native words with no analyzable structure (가다, 좋다), obvious splits (숨소리 is 숨 + 소리), and origins that aren't established. Don't guess a folk etymology. This field is about the word itself, so the grammar of an ending goes in `notes`.

## notes

A short usage note when it helps, otherwise an empty string.

When the pick carries an ending or pattern beyond the basics a learner at this level knows (-아/어요, -았/었-, -고, -는), start the note with its construction: the stem plus the ending, and what the ending does. Expand a contracted ending to its full form, because a contraction can look like a different ending. For example:

- 헤매듯: `헤매- + -듯 (as if)`
- 떠나던: `떠나- + -던 (recalls an action in progress in the past)`
- 조용할수록: `조용하- + -ㄹ수록 (the more ...)`
- 지킨다는 약속: `지킨다는 = 지킨다고 하는: a promise that says "I'll protect it"`
- 고백하래: `고백하- + -래 (= -라고 해: says to)`, not -ㄹ래 ("want to")

Other useful notes, after the construction:

- a contrast with a similar form
- related words, each tagged by what it is: `(.syn)` synonym, `(.ant)` antonym, `(.hon)` honorific form, `(.syn:native)` 순우리말 equivalent, `(.syn:casual)` or `(.syn:formal)` register variant. Separate multiple words with commas. Skip inflection pairs (닫히다 → 닫다) and contractions (뭐 → 무엇).
