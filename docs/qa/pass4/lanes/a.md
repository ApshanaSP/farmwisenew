# Lane a: Jarvis understanding (fixer notes, QA pass 4)

Frozen clock, real client path (tests/qa/pass4/grader/client-sim.ts), no model key. Open set: baseline = open-baseline-codelanes. Every cluster has a before file in lanes/a/, a sweep in sweeps/, a guard test, and a row in lanes/a.jsonl.

## RC-01: an outside place or body is decided by a closed list, and the check is skipped in lanes

Root cause. "Is this about a place or body that is not ours" was answered in one lane only (the brief turn), from two closed lists (outside.ts ONE/TWO and a one-word-before-"department" rule). The fast lane (quick.ts), the follow-up frame (frame.ts) and the no-model rules (understand.ts) never asked it, so "Kumbakonam police", "Colombo-la vellam" or "not this Manali" got our police filter or our brief. Where a list missed a town (any name not on it) the sentence fell through as ours.

Why earlier tests missed it. BUG-002 and BUG-030 were tested with one or two named cities and only in the resolver. The fast lane, frame and rules take other paths.

Fix (mechanism). One question, `foreignIn()` in entities.ts, asked first by every lane: quickScreen, resolveFrame, understand and briefTurn. It is not a list lookup alone: the lists in outside.ts are complete reference data (States and Union Territories of India, Census 2011 cities of a million or more, ISO 3166 countries and capitals, with the source in the comment), and for a name on no list `nameBeside()` decides: an unknown word in front of an agency word is another place's or body's (a name that is no word of our lexicon, grammar, zones, the Corporation's 250 area names in areas.ts, or an ordinary English word, Tanglish verb or jurisdiction word). Kinds of body that are always someone else's (college, association, council, court, ...) and jurisdiction words (state, central, district, airport police) are another body. "A word before department is an agency" now needs the same name test (was: any word). `detectLang` (normalise.ts) was one word list that read "Thiru Vi Ka Nagar" as Tamil and missed Tanglish; it now counts marks (particles, endings, question words, verbs): two marks, or one in a short sentence, is Tanglish.

Class guard. src/lib/thunai/lane-a.pass4.test.ts: towns the code was never told about crossed with every agency head and every language, run through every lane; a static check that each lane calls foreignIn before it builds anything; our own bodies and places never taken for foreign.

Result on the open set: wrong 66 to 50, confident wrong 42 to 27, no right-to-wrong row.

## RC-04: a command reflex or an English-only guard list takes a question, a keeping note or a forbidden order

Root cause. The same sentence goes through four lanes (the console's own reflex test in plan.ts, the brief turn, the fast lane and the rules), and each had its own English-only list of what is not a question: NOT_A_BRIEF (brief turn only), NAV_VERB (any "just", "only", a Tamil verb stem anywhere inside a longer word such as the word for protest), a speed rule on a Tamil word that also means "slow" in "which department works slowly", and a workspace opener in English only. So "remind me ...", "keep ... for later", a Tamil "type this" or "change the status to closed" were briefs or filters, and a list or number question was acted on as a move with no model.

Why earlier tests missed it. BUG-001 and BUG-022 were fixed in one lane each, with English sentences. No test sent one sentence to every lane and asked for the same class.

Fix (mechanism). One intent table by language in lexicon.ts (KEEPING and CHANGE_RECORD: English, Tanglish and Tamil with Tamil word edges), read by briefTurn, quickScreen and the rules (late guard: a keeping note no rule read is never a filter; an order to change a record is refused like a delete). isNavCommand: Tamil verbs are whole words, a data ask (list, number, total, give, take out; Tamil and Tanglish forms) with a filter is never a console move, "show ... in ward N" with case or complaint words is a picture of the data. Speed is an order only when short or about the voice and never a question. Workspace open by name works in Tamil and Tanglish. "Jarvis, click X" names the control X. detectLang counts Tanglish marks against English function words, so the reply language is not decided by one word.

Class guard. lane-a.pass4.test.ts RC-04: keep and change sentences about every body in three languages through the brief turn, the fast lane and the rules; data asks and Tamil verbs inside longer words through isNavCommand; speed, workspace and click checks.

Result. open-baseline findings 7 and 44 fixed; 43 is partly fixed (7 of its 8 rows are safe; the eighth drops a category filter: RC-05). audit-understanding-9 and -22, audit-privacy_injection-13, audit-client_browser-12 and meta-words-3 are plain tests now.

## RC-05: category, filter and deadline word lists closed, mis-ordered or dropping a filter

Root cause. The fast lane and the rules each read topic, status and filters from their own lists. CAT_ALIASES had no stem ("drain"), no stray animals, and the bare word "water" beat "lakes". Status knew one phrase for past the deadline, and "unresolved" was in the fill-in-the-blanks list. A ward or a department word was read by no slot and then silently dropped, so the answer was the zone's total. Position ties compared a Tamil word with a leading space against an English word, so the same question had a different topic in another language.

Why earlier tests missed it. The metamorphic suite (same question, other words) was not part of earlier passes; each fix tested one phrasing.

Fix (mechanism). `statusIn()` is the one reader of "past the deadline" and "still open" (three languages, overdue wins). Category stems ("drainage" is also "drain") are derived from the table and kept only if they name one category; topics the data files under a category are listed once with their reason; Tamil flood warning is a longer name than the flood word and wins by position. A broad word yields to a specific one. A lane that has no slot for a ward or a department with no topic returns nothing, so the agent asks (a filter that is read is applied or the lane says nothing). An extra topic word in an explain ("flood relief need") is no longer answered as the first topic.

Class guard. lane-a.pass4.test.ts RC-05: no spoken name belongs to two categories; the same four questions in English, Tanglish and Tamil have the same topic; every deadline and open phrase gives one status; water never beats lakes; ward and department words bail; metamorphic.test.ts is the gate (known file shrinks: keys m18:tanglish, m21:tanglish, m28:ta, m29:ta, m07:ta, m28:polite removed).

Result. meta-words-4 to -9, audit-understanding-12, -13, -14 and open-baseline-18 are plain tests. Not fixed in this cluster: audit-understanding-16 (power cut has no category in the data, so it is left to the agent, but the fast lane still answers it with the zone list) and the remaining Tamil rewrites in meta-words-1 and -2.

## RC-02: fuzzy and sound matching turns everyday words and foreign names into zones, bodies, reservoirs, cases

Root cause. Two matchers (entities.ts for bodies and zones, understand.ts for the rules' slots) accepted a one-letter or two-letter difference or an equal sound with no second signal: the first letter could differ, an ordinary word (the Tamil for this week, summary, Collector, state, "there", "do it") could be a name, a six-letter skeleton matched a reservoir (pannidu is Poondi), pieces of an ordinary phrase were joined into a name, a zone's first word alone (Anna) was a name, the Tamil word for the city swallowed the nagar of a name, and a short Tamil name ending in -u was cut to a two-letter stem (கொ matched கொடு, "give").

Why earlier tests missed it. Tests used clean names. There was no test with sentences that hold no place at all.

Fix (mechanism). A heard word is one of ours only if it starts like the name; an ordinary word (stop words, brief words, the lanes' own listed words, adverbs and verbs) matches only when spelt exactly; sound matches for reservoirs only from seven letters; the Tamil stem cut needs a name of five letters or more; a one-word partial name of a zone is dropped (the full Anna Nagar still works); the Tamil nagar after a name stays nagar; a locality spelt another way is found by folded spelling (worked out once per World, bounded for very long input); a number before the word zones is a count.

Class guard. lane-a.pass4.test.ts RC-02: 25 everyday sentences in three languages that hold no place must resolve to no body and no zone; Anna Salai and Anna University are not Anna Nagar; the taMatch short-name cases; first letter and count.

Result. audit-understanding-5, -6, -24 are plain tests; open-baseline 5, 6, 39, 41, 42 fixed; confident wrong 26 to 21. Open in this cluster: audit-understanding-10 (Chetpet and T Nagar are not narrowed: the Corporation's list holds them but the data's places do not), open-baseline-37, -38, -40 (a body or topic in the planner's reach, and "second one" in a follow-up), PB-020 in Tamil with the Collector word.

## RC-03: short words matched inside longer words with no word edge (plus RC-14, PB-146 in normalise.ts)

Root cause. Latin patterns had `\b`, Tamil ones did not: `has()` and `catIn()` used a plain substring test for Tamil, so the two-letter word for fire matched inside the word for severe, a Tamil verb stem matched inside the word for police and for protest, and the verb "explain" matched the word for a lamp (street light). "high" and "low" were severities anywhere ("High Court", "high tide", "low lying"). normalise() looked words up with `tok in LOAN` and `tok in EN_NUM`, so "constructor" came out as the Object function and the rules threw.

Why earlier tests missed it. Tests were English, where the boundary is in the regex. The static word audit (word-pattern-audit.mjs) existed but was never a test.

Fix (mechanism). One word-edge function, `tamilAt`, for every Tamil word of every list in the fast lane (nothing Tamil before it; after it, a short word takes only its case endings); one rule for the weak severity words (WEAK_SEV and SEV_NOUN, read by the fast lane and the rules); the explain verb pattern is whole-word and excludes lamp words; Object.hasOwn for the two lookups (RC-14). plan.ts verbs are whole words (RC-04).

Class guard. lane-a.pass4.test.ts RC-03: every short Tamil alias is run against every Tamil word of the lexicon (zone names, departments, categories, severities) and may match only as a word with an ending; the fire and severe, lamp and explain, high and low cases; every name on Object.prototype is fed to normalise and the rules and must not throw or enter the tokens as code.

Result. audit-understanding-21 (all but one sentence), -23, audit-privacy_injection-10, meta-words-10 and -11, scans-code-1, open-baseline-21 and -22 are plain tests. Kept open: the Tamil phrase for harsh sun (the word for severe is also the everyday word for harsh, so only a planner can tell) and open-baseline-23. gloss.ts holds no word that needed an edge.
