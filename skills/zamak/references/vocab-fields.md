# Vocab Fields

Pick & Fill and Fill Bookmarks both return these three fields for each word.

## translation

The English meaning in this caption, not a dictionary dump. Keep it concise. When the word is inflected, end with its dictionary form in parentheses, such as `as if wandering lost (헤매다)` for 헤매듯, so the learner can look it up.

## etymology

The word's origin or structure when it helps learning, otherwise an empty string. Use a minimal format with no explanations beyond a short gloss:

- Sino-Korean: Hanja, followed by Japanese kanji when they differ (`價格 / 価格`, `希望`)
- auxiliary verb compounds: `잊다 + 버리다`
- passive, causative, and nominalization: `듣다 + 리 (passive)`, `웃다 + 기 (causative)`, `걷다 + 음 (nominalization)`
- compounds, with each root before sound change and each native root's meaning in parentheses: `목 (throat) + 숨 (breath)` for 목숨, `개 (dog) + 아지 (diminutive)` for 강아지, `갈비 (ribs) + 湯` for 갈비탕. Hanja need no gloss, because the characters carry their meaning.
- loanwords, with the borrowing path: `computer`, `アルバイト / Arbeit`
- contractions: the full form, such as `아이` for 애

Leave it empty for native words with no analyzable structure (가다, 좋다) and origins that aren't established. Give every compound its split, even one that looks obvious, such as `숨 (breath) + 소리 (sound)` for 숨소리, because what is obvious depends on what the reader already knows. Don't guess a folk etymology. This field is about the word itself, so the grammar of its inflection goes in `notes`.

## notes

A short usage note when it helps, otherwise an empty string. The app shows each bookmark with its caption row, both the Korean and the English, so don't restate the row in the note. A literal translation of a phrase still helps when it shows how a construction works, as in the 지킨다는 example below.

An inflected word is a stem (어간) plus endings (어미). When the pick carries an ending beyond the basics a learner at this level knows (-아/어요, -았/었-, -고, -는), or a construction made of several pieces, start the note with its breakdown: the stem, each ending or construction, and what it does. A contracted construction can look like a different ending, so expand it to its full form. In an auxiliary construction, such as V-아/어 보다, 주다, 드리다, or 있다, the -아/어 attaches to the main verb and the later endings to the auxiliary. For example:

- 헤매듯: `헤매- + -듯 (as if)`
- 떠나던: `떠나- + -던 (recalls an action in progress in the past)`
- 조용할수록: `조용하- + -ㄹ수록 (the more ...)`
- 지킨다는 약속: `지킨- + -다는 (= -다고 하는) + 약속: a promise that says "I'll protect it"`
- 고백하래: `고백하- + -래 (= -라고 해: says to)`, not -ㄹ래 ("want to")
- 그래 봤자일 거 같다: `그렇- + -어 + 보- + -았자 (even if, it's no use) + 이- + -ㄹ 거 같다 (probably)`, not `보- + -아 봤자`

A noun with a particle gets a breakdown too. Name a bound noun (의존 명사), such as 외, 데, or 치, as bound, because it doesn't read as a word without its modifier. When a particle does something other than its default job, say what it does. For example:

- 그 외의 것들: `외 (bound noun: other than) + 의`
- 트립닷컴에서 낳은 딸: `트립닷컴 + 에서 (marks an institution as the subject, as in 정부에서 발표했다)`, not a place

Other useful notes, after the breakdown:

- a contrast with a similar form
- for an idiom built on a concrete image, that image in one clause, such as for 딴지 걸다: 딴지 (= 딴죽) is a leg-hook trip, so hooking one means raising petty objections
- when the pick is the less common form in its family, that it is, with the usual one, such as 굉장한 next to 굉장히, the form common in speech
- a false friend: when reading the word through the Japanese sense of the same characters would leave a wrong idea of the word itself, beyond this line, that difference in one clause, such as for 인재: a talented person, while Japanese 人材 often means neutral personnel (Korean 인력). Skip it when the row's English settles the sense and nothing wrong carries over, as "study" does for 공부 (工夫).
- related words, each tagged by what it is: `(.syn)` synonym, `(.ant)` antonym, `(.hon)` honorific form, `(.syn:native)` 순우리말 equivalent, `(.syn:casual)` or `(.syn:formal)` register variant. Separate multiple words with commas. Skip inflection pairs (닫히다 → 닫다) and contractions (뭐 → 무엇).
