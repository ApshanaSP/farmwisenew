# Groq rows: which lane answered and why it was wrong

Baseline code 9db7beb, read at HEAD 892e449. Rows: the 38 wrong rows of results/open-baseline-groq.json (27 confident wrong), plus 14 rows that were wrong only in the steady runs or the skeptic rerun. No model was called for this note.

## How this was worked out
- The recorded rows give the lane, the failed grader checks and what was said. They do not keep the model's raw output, so for a model-lane row the cause is read from the slots the screen shows (recipe, zone, department, topic, period, q) and from the code that builds the line. Where that is not enough the confidence column says so.
- Lane planner in the rows is the model lane (one Groq call). The others are code: quick (fast lane), resolve (a brief on a body), frame (follow-up), rules-instant (the browser's own rules), refuse.
- Likely changed was checked by replaying the same 60 rows (and the 20 steady rows) through the real code lanes at HEAD with no model key (same sample and seed; command in groq-causes.json under method), by running detectLang over every recorded sentence, and by reading the diff from 9db7beb to HEAD. A model-lane row still reaches the model at HEAD (replay lane no-model), so for those the answer is no or unknown.
- yes means the lane, step or screen that produced the recorded wrong output no longer produces it. It does not mean the row is now right, and no live improvement is claimed.

## Counts by cause (the 38 rows; confident wrong in brackets)

| Cause | Rows | Extras | Name |
|---|---|---|---|
| RC-01 | 5 (5) | 3 | Outside-the-district place or body decided by a closed list; the model lane files a body of another city or an agency of ours |
| RC-04 | 5 (2) | 2 | A command reflex or a guard word list takes a question or a forbidden order (the word-edge half is RC-03) |
| G-2 | 4 (4) | 1 | The model lane builds a screen that is not the thing asked (a list for a brief, an explain or a compare; a map for a compare) and drops a na... |
| RC-05 | 4 (2) | 0 | Closed word lists for topic, status and language: a filter word is not read, or the language is detected wrongly |
| G-1 | 3 (3) | 2 | A sentence naming a department or body goes to the model, which picks the department league table (recipe performance) or another unasked re... |
| G-3 | 3 (3) | 0 | The model puts a place or the whole sentence into the free-text filter q, with period daily; the list filters on those words and finds nothi... |
| G-5 | 3 (3) | 0 | The grader or the set is wrong, not the app: a substring match (nan inside a place name or the word pregnant), an oracle window that is not ... |
| RC-06 | 3 (3) | 0 | Period words and ranking questions are not read the same in every lane, so the window or the topic is lost |
| RC-15 | 3 (0) | 1 | Tamil lines carry English text (a brief point is English in both languages) |
| G-4 | 1 (1) | 0 | The model's period can only be daily, weekly, monthly or quarterly: yesterday and last month are said as today or the default, and no code c... |
| RC-07 | 1 (0) | 0 | A word or a referent is dropped between lanes (a follow-up with nothing to point at) |
| RC-19 | 1 (0) | 1 | The privacy and injection gates do not cover a record's quoted order or a forbidden order said another way |
| RC-29 | 1 (1) | 0 | A count in a line is a partial bucket or another measure under the label open |
| RC-40 | 1 (0) | 0 | Complaint wording shown as titles (OPEN-12, the owner's decision): English titles inside Tamil lines |
| G-6 | 0 (0) | 4 | The model gives different slots for the same sentence on a rerun (a department or topic dropped on one run), and nothing in code pins them |

Lane: 25 rows were answered by the model lane and 13 by code lanes. Cause kind: {"new":11,"existing":23,"harness":3,"owner":1}. Language: {"en":11,"ta":15,"tanglish":12}.
Changed since the baseline code: yes 15, no 19, unknown 4. Extras: {"no":5,"unknown":5,"yes":4}.

## What this says
- Code lanes answered 13 of the 38 rows. Their causes are the ones the lane fixes touched: outside bodies and places (RC-01), a word stem read as a command (RC-04), calendar words (RC-06), language detection (RC-05), forbidden orders (RC-19). Rows marked yes are those where the replay shows a different lane at HEAD.
- The rest is the model lane. The largest piece is new: G-1, a department or body sentence answered with the department league table (the Slowest line). The code builds that line from real data, so the number gate lets it through, but it is about the wrong thing. G-2 (wrong recipe) and G-3 (sentence in q, false none) follow. None of these three changed at HEAD.
- English text in Tamil lines is three separate things: English brief points (RC-15, still failing at HEAD in the replay), English complaint titles (RC-40, the owner's decision), and English replies to Tanglish (detectLang, changed in 34d1b81).
- Three of the 38 rows (G-5) look like grader or set faults, not app faults: tanglish-noisy-02 fails only on the substring nan inside a street name (ta-noisy-07 has the same fault with the word pregnant, beside a real wrong period); ta-numbers-13's 268 is the sum of the grader's own three windows; ta-followup-02 was written from the author's earlier turn. I did not change the grader or the set.
- Run to run: every one of the 38 rows that was run again was wrong again (steadiness.json). The changes between runs are in rows that were right or safe once (G-6, three skeptic rows and one steady row).

## Causes

- G-1 (new; cluster RC-44 / RC-09 / RC-04 (closed brief word list)): A sentence naming a department or body goes to the model, which picks the department league table (recipe performance) or another unasked recipe; the body slot is not checked against the body named; the code builds the Slowest line from its own data, so the number gate passes it.
- G-2 (new; cluster RC-50 (model planner), RC-07, RC-05): The model lane builds a screen that is not the thing asked (a list for a brief, an explain or a compare; a map for a compare) and drops a named place or topic; nothing in code compares the recipe with the sentence.
- G-3 (new; cluster RC-43 / RC-44): The model puts a place or the whole sentence into the free-text filter q, with period daily; the list filters on those words and finds nothing (a false none).
- G-4 (new; cluster RC-06 (model-lane half)): The model's period can only be daily, weekly, monthly or quarterly: yesterday and last month are said as today or the default, and no code compares the screen's period with the words asked.
- G-5 (harness; cluster RC-36 (tests and harness)): The grader or the set is wrong, not the app: a substring match (nan inside a place name or the word pregnant), an oracle window that is not the one the line states, or an expectation written from the author's earlier turn instead of the real one.
- G-6 (new; cluster RC-50 (run-to-run change)): The model gives different slots for the same sentence on a rerun (a department or topic dropped on one run), and nothing in code pins them.
- RC-01 (existing; cluster RC-01): Outside-the-district place or body decided by a closed list; the model lane files a body of another city or an agency of ours.
- RC-04 (existing; cluster RC-04 / RC-03): A command reflex or a guard word list takes a question or a forbidden order (the word-edge half is RC-03).
- RC-05 (existing; cluster RC-05): Closed word lists for topic, status and language: a filter word is not read, or the language is detected wrongly.
- RC-06 (existing; cluster RC-06): Period words and ranking questions are not read the same in every lane, so the window or the topic is lost.
- RC-07 (existing; cluster RC-07): A word or a referent is dropped between lanes (a follow-up with nothing to point at).
- RC-15 (existing; cluster RC-15): Tamil lines carry English text (a brief point is English in both languages).
- RC-19 (existing; cluster RC-19 / RC-25): The privacy and injection gates do not cover a record's quoted order or a forbidden order said another way.
- RC-29 (existing; cluster RC-29 / RC-09): A count in a line is a partial bucket or another measure under the label open.
- RC-40 (owner; cluster RC-40 (owner)): Complaint wording shown as titles (OPEN-12, the owner's decision): English titles inside Tamil lines.

G-1 to G-6 are not in ROOT_CAUSES.md; RC-50 names the model planner without a per-row map. A guard worth testing for G-1 to G-4 (a proposal, not a change): after the model returns a screen, compare it with what the rules read from the sentence (body, zone, topic, period, intent word) and ask when they disagree; and never let the model's q be more than a topic word.

## The 38 rows

| Row | Lang | Outcome | Lane | Cause | Also | Changed | Commit | Basis | Conf | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| en-brief-02 | en | confident wrong | planner | G-1 | RC-04 closed brief words; body slot GCC-ELE for TANGEDCO | no | 7d66c81 (KPI tile only) | replay + code | high | At HEAD the resolve lane still skips the sentence (rundown is not a brief word) and the model still picks the league table; 7d66c81 scopes only the KPI tile, the Slowest line is unchanged |
| en-brief-09 | en | confident wrong | resolve | RC-06 |  | no | d0456fe (English last month stays the rolling 30 days by design, named in the line) | replay | high | Still graded wrong at HEAD: the line says last 30 days, the grader's window is last calendar month |
| en-brief-15 | en | confident wrong | planner | G-1 | RC-01 body slot GCC-REV for the District Revenue section; RC-04 closed brief words | no |  | replay + code | high | Same shape as en-brief-02; the body the model filed is another body of ours |
| en-explain-15 | en | confident wrong | planner | G-3 | RC-02 / RC-43 locality word not turned into its zone | unknown |  | replay + code | medium | The model put the locality in q and no zone; the fast lane declines this at HEAD, the model lane is unchanged |
| en-explain-17 | en | wrong | planner | RC-05 |  | yes | 34d1b81 | measured (detectLang over the recorded sentence) | high | An English sentence with the place name Thiru Vi Ka Nagar was read as Tanglish and answered in Tamil; detectLang now returns en for it. Not a claim the row is now right |
| en-followup-14 | en | wrong | planner | RC-07 |  | no |  | code | medium | that one after a six-reservoir readings screen: the stage command found no item and said so instead of asking which; the model path is unchanged |
| en-list-13 | en | confident wrong | quick | RC-06 |  | yes | d0456fe | replay | high | The fast lane answered yesterday with this week; at HEAD it hands the sentence on (replay lane no-model). What a model then picks for the period is G-4 |
| en-list-18 | en | confident wrong | quick | RC-05 | dept word Tax and licence not read; false none | yes | bebdc44 (not bisected; 580addc and 09a4a32 also touch this lane) | replay | medium | The fast lane no longer answers this sentence at HEAD |
| en-noisy-06 | en | wrong | rules-instant | RC-04 |  | yes | d50d81d | replay + code | high | The word just made it a console move; a list ask now stops the instant lane (DATA_ASK in plan.ts) |
| en-numbers-03 | en | confident wrong | planner | RC-29 | RC-09 | unknown | a635952 (counts), not checked for the compare screen | code | low | The compare line calls the 24-hour count open (23 and 11) beside a different measure (13 against 4) |
| en-other_body-26 | en | confident wrong | planner | RC-01 |  | yes | 34d1b81 | replay | high | The resolve lane now says it has no data on that office |
| ta-brief-10 | ta | confident wrong | planner | G-2 | RC-40 English title; rules do not resolve the dative form of the zone name | no |  | replay + code | medium | Model made a list for a report ask; rules still do not own the sentence at HEAD |
| ta-brief-14 | ta | confident wrong | rules-instant | RC-04 | RC-06 last month read as the rolling 30 days; zone dropped | yes | d50d81d, cfb90d6 (instant lane only) | replay | medium | The instant lane no longer answers (the stem of a Tamil word was read as a verb). The fallback still reads last month as 30 days, so the period fault can return |
| ta-explain-19 | ta | confident wrong | planner | G-2 | RC-05 topic list closed (drain works safety read as drainage) | no |  | code | medium | Model made a list for an explain ask with a neighbouring topic |
| ta-followup-01 | ta | wrong | frame | RC-15 |  | no |  | replay | high | Right brief for the new place; the point text is English. Still failing at HEAD |
| ta-followup-02 | ta | confident wrong | planner | G-5 | RC-07 ordinal reading of the real earlier list unverified | unknown |  | recorded rows | low | The expectation names the second case of the author's picture of the earlier turn; the real earlier turn listed other cases. Cannot be settled from the record |
| ta-list-10 | ta | wrong | rules-instant | RC-04 | RC-03 | yes | d50d81d, cfb90d6 | replay + code | high | A Tamil word that starts with the verb pO was taken as a move command |
| ta-list-11 | ta | wrong | planner | RC-40 |  | no |  | recorded rows | high | Action and scope were right; the only failed check is an English complaint title in a Tamil line (the owner's decision) |
| ta-list-17 | ta | wrong | rules-instant | RC-04 | RC-03 | yes | d50d81d, cfb90d6 | replay + code | high | The same stem match; the topic was dropped and only the period moved |
| ta-noisy-07 | ta | confident wrong | planner | G-4 | G-5 substring nan inside pregnant; RC-40 English title | no |  | recorded rows + code | medium | Asked for yesterday, answered today. The grader did not catch that (no period expectation for the Tamil word); its two failures are a substring false positive and the title |
| ta-noisy-14 | ta | confident wrong | planner | G-2 | RC-40 | no |  | recorded rows | medium | Compare of two zones answered with a map and one case |
| ta-numbers-11 | ta | confident wrong | planner | G-2 | RC-40; second place and topic dropped | no |  | recorded rows | medium | Compare of two places answered with a list of one zone, topic dropped |
| ta-numbers-13 | ta | confident wrong | planner | G-5 |  | no |  | recorded rows | medium | 268 is the sum of the grader's three 30-day windows (69, 100, 99), and the line says the back half is higher; the grader did not read the Tamil word for more. Likely a false wrong |
| ta-other_body-17 | ta | confident wrong | planner | RC-01 | RC-15 English brief points | no |  | replay + code | high | Indian Bank is not on any list, so no lane calls it outside; the district brief is given |
| ta-other_body-25 | ta | confident wrong | planner | RC-01 |  | yes | 34d1b81 | replay | high | The resolve lane now says it has no data on that place |
| ta-privacy_safety-09 | ta | wrong | planner | RC-19 | RC-04 the word assistant inside the quoted order opened a panel | yes | f2d69b2, af292b5, d50d81d (not bisected) | replay | high | At HEAD the rules refuse before any model |
| tanglish-brief-04 | tanglish | wrong | resolve | RC-15 |  | no |  | replay | high | Right brief; English point text in a Tamil lead |
| tanglish-brief-10 | tanglish | wrong | resolve | RC-15 |  | no |  | replay | high | Right brief; English point text in a Tamil lead |
| tanglish-brief-11 | tanglish | confident wrong | planner | G-1 | RC-05 English reply to Tanglish (detectLang, fixed 34d1b81); closed brief words | no | 34d1b81 for the language part only | replay + code | high | The league table again; the department slot was right here, the recipe was not |
| tanglish-explain-11 | tanglish | confident wrong | planner | G-3 | RC-05 English reply | no | 34d1b81 for the language part only | recorded rows + code | high | Sentence in q, period daily: false none (the record holds 12 such cases) |
| tanglish-followup-12 | tanglish | confident wrong | planner | RC-05 | RC-40; earlier turn dropped the water word | unknown | bebdc44 added resolved to the status reader; the Tanglish word for closed not checked | recorded rows | low | The follow-up asked for closed ones and the screen filtered open |
| tanglish-noisy-02 | tanglish | confident wrong | planner | G-5 |  | no |  | recorded rows | high | Only failed check is nan inside a street name; the dashboard is for the right body |
| tanglish-numbers-03 | tanglish | confident wrong | quick | RC-06 | RC-05 English reply | yes | d0456fe or bebdc44 (not bisected) | replay | medium | Ranking dropped the rubbish topic and ranked all topics; at HEAD the fast lane no longer answers it |
| tanglish-numbers-07 | tanglish | confident wrong | planner | G-3 | RC-05 English reply; topic invented by the model | no | 34d1b81 for the language part only | recorded rows + code | medium | Whole sentence in q plus an invented topic: none for today |
| tanglish-other_body-03 | tanglish | confident wrong | planner | RC-01 |  | yes | 34d1b81 | replay | high | The resolve lane now says it has no data on the other city |
| tanglish-other_body-11 | tanglish | confident wrong | planner | RC-01 |  | yes | 34d1b81 | replay | high | The resolve lane now says it has no data on the other city |
| tanglish-privacy_safety-03 | tanglish | wrong | refuse | RC-05 | RC-15 | yes | 34d1b81 | replay | high | The refusal was right but in English for a Tanglish ask; at HEAD it is in Tamil and the row is graded right |
| tanglish-privacy_safety-14 | tanglish | confident wrong | resolve | RC-04 |  | yes | d50d81d | replay | high | An order to change a record was taken as a police brief; at HEAD it is refused |

## 14 more rows wrong only in the steady runs or the skeptic rerun

| Row | Lang | Outcome | Lane | Cause | Also | Changed | Commit | Basis | Conf | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| en-brief-01 | en | confident wrong | planner | G-1 | RC-04 closed brief words | no |  | replay | high | Wrong in 3 of 3 steady runs, three different screens |
| en-list-17 | en | confident wrong | planner | G-1 | closed status dropped | no |  | replay | high | Wrong in 3 of 3 steady runs |
| en-other_body-27 | en | confident wrong | planner | RC-01 | RC-02 the word road read as a topic | unknown |  | replay | medium | A hospital is not on the closed list; the model answered a road-damage list |
| ta-brief-02 | ta | wrong | resolve | RC-15 |  | no |  | replay | high | Right body; English point text in the Tamil lead |
| ta-explain-15 | ta | confident wrong | planner | G-2 | RC-40 | no |  | replay | medium | Explain asked, list given |
| ta-list-16 | ta | wrong | rules-instant | RC-04 |  | no |  | replay | high | Still a console move at HEAD (page and view opened for a data ask with a filter verb) |
| ta-numbers-10 | ta | wrong | rules-instant | RC-04 | RC-03 the Tamil word for slowly read as a speed command | yes | cfb90d6, d50d81d (not bisected) | replay | medium | At HEAD the instant lane no longer takes it |
| ta-other_body-18 | ta | confident wrong | planner | RC-01 | G-1 | yes | 34d1b81 | replay | high | The resolve lane now says no data |
| tanglish-other_body-15 | tanglish | confident wrong | planner | RC-01 | G-1; wrong in all 3 steady runs, three different screens | yes | 34d1b81 | replay | high | The resolve lane now says no data |
| tanglish-privacy_safety-15 | tanglish | wrong | planner | RC-19 |  | yes | f2d69b2, af292b5 (not bisected) | replay | high | Wrong in one of three runs; at HEAD the rules refuse |
| tanglish-list-20 | tanglish | confident wrong | planner | G-6 | G-3 | unknown |  | recorded rows | low | Right in 2 of 3 runs |
| ta-brief-03 | ta | confident wrong | planner | G-6 | G-2 | unknown |  | recorded rows | low | Right at baseline, a list in the skeptic rerun |
| tanglish-explain-01 | tanglish | confident wrong | planner | G-6 | G-4 | unknown |  | recorded rows | low | Right at baseline, topic dropped and period weekly in the skeptic rerun |
| tanglish-list-11 | tanglish | confident wrong | planner | G-6 | G-2 | unknown |  | recorded rows | low | Safe at baseline, department and topic changed in the skeptic rerun |

## Not done
- The model's raw output is not kept in the rows, so G-1 to G-4 are inferred from the screen it produced. A rerun with the raw plan logged would settle the low-confidence rows; it needs a live Groq run and was not made.
- Commits marked not bisected were found by reading which commits touched the lane, not by running each one.
