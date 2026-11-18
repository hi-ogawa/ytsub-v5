# Vocab Fields

Pick & Fill and Fill both return these three fields for each word.

## translation

The English meaning in this caption, not a dictionary dump. Keep it concise.

## etymology

The word's origin or structure when it helps learning, otherwise an empty string. Use a minimal format with no explanations:

- Sino-Korean: Hanja, followed by Japanese kanji when they differ (`價格 / 価格`, `希望`)
- auxiliary verb compounds: `잊다 + 버리다`
- passive, causative, and nominalization: `듣다 + 리 (passive)`, `웃다 + 기 (causative)`, `걷다 + 음 (nominalization)`
- compounds, with each root before sound change: `개 + 아지` for 강아지, `갈비 + 湯` for 갈비탕
- loanwords, with the borrowing path: `computer`, `アルバイト / Arbeit`
- contractions: the full form, such as `아이` for 애

Leave it empty for native words with no analyzable structure (가다, 좋다), obvious splits (숨소리 is 숨 + 소리), and origins that aren't established. Don't guess a folk etymology.

## notes

A short usage note when it helps, otherwise an empty string. Useful notes include:

- the grammar pattern behind a pick that isn't a single word, such as -ㄹ수록 ("the more ...") in 조용할수록
- a contrast with a similar form
- related words, each tagged by what it is: `(.syn)` synonym, `(.ant)` antonym, `(.hon)` honorific form, `(.syn:native)` 순우리말 equivalent, `(.syn:casual)` or `(.syn:formal)` register variant. Separate multiple words with commas. Skip inflection pairs (닫히다 → 닫다) and contractions (뭐 → 무엇).
