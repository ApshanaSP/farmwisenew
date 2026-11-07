# Lane a: Jarvis understanding (fixer notes, QA pass 4)

Frozen clock, real client path (tests/qa/pass4/grader/client-sim.ts), no model key. Open set: baseline = open-baseline-codelanes. Every cluster has a before file in lanes/a/, a sweep in sweeps/, a guard test, and a row in lanes/a.jsonl.

## RC-01: an outside place or body is decided by a closed list, and the check is skipped in lanes

Root cause. "Is this about a place or body that is not ours" was answered in one lane only (the brief turn), from two closed lists (outside.ts ONE/TWO and a one-word-before-"department" rule). The fast lane (quick.ts), the follow-up frame (frame.ts) and the no-model rules (understand.ts) never asked it, so "Kumbakonam police", "Colombo-la vellam" or "not this Manali" got our police filter or our brief. Where a list missed a town (any name not on it) the sentence fell through as ours.

Why earlier tests missed it. BUG-002 and BUG-030 were tested with one or two named cities and only in the resolver. The fast lane, frame and rules take other paths.

Fix (mechanism). One question, `foreignIn()` in entities.ts, asked first by every lane: quickScreen, resolveFrame, understand and briefTurn. It is not a list lookup alone: the lists in outside.ts are complete reference data (States and Union Territories of India, Census 2011 cities of a million or more, ISO 3166 countries and capitals, with the source in the comment), and for a name on no list `nameBeside()` decides: an unknown word in front of an agency word is another place's or body's (a name that is no word of our lexicon, grammar, zones, the Corporation's 250 area names in areas.ts, or an ordinary English word, Tanglish verb or jurisdiction word). Kinds of body that are always someone else's (college, association, council, court, ...) and jurisdiction words (state, central, district, airport police) are another body. "A word before department is an agency" now needs the same name test (was: any word). `detectLang` (normalise.ts) was one word list that read "Thiru Vi Ka Nagar" as Tamil and missed Tanglish; it now counts marks (particles, endings, question words, verbs): two marks, or one in a short sentence, is Tanglish.

Class guard. src/lib/thunai/lane-a.pass4.test.ts: towns the code was never told about crossed with every agency head and every language, run through every lane; a static check that each lane calls foreignIn before it builds anything; our own bodies and places never taken for foreign.

Result on the open set: wrong 66 to 50, confident wrong 42 to 27, no right-to-wrong row.
