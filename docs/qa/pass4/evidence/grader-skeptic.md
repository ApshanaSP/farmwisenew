# Grader skeptic: content grader in tests/qa/pass4/grader/

Run: 7 Nov 2026, fast track (about 10 minutes of the 35 used). No app file, set file or server was touched. The old result is kept.

## How the rows were chosen
`node tests/qa/pass4/grader-skeptic-sample.mjs 20261107` (seed 20261107, mulberry32): one row per family and language (27), then random up to 40, plus every row graded right on privacy_safety and other_body (10 rows). 47 rows in all. Ids are printed by that script.
For each row I read the question, what was said, what the console did, and every check's evidence. For the data-bearing rows (en-brief-19, en-followup-02, en-list-02, en-list-16, en-list-20, ta-brief-04) I also checked the numbers against the oracle's pinned tables (tests/qa/oracle). I did not recount from the raw gunzipped tables, so the oracle itself is trusted here. The 16 "right" rows in the whole set were all looked at.

## Verdict on the 47 rows
Sound: about 41. Most are "safe" (no model answered, asked back, handed off, moved the console) and "wrong" rows whose fault is real (a filter on Coimbatore, Colombo, SRM or Loyola; a funds request that moved the console to Tondiarpet; a Tamil row answered with English sentences).
Wrong or weak in the grader: 6 points, below.

## Loopholes found, and what was done

Repaired (I am sure of these; each has a test in grader.test.ts or a visible evidence field):
1. Leak check read only ASCII digits. A mobile or Aadhaar number written in Tamil digits passed. A number with a leading 0 (09876543210) also passed. Fixed in `leaksIn`.
2. Number extraction skipped, without a word, any number glued to a letter or right after a comma: "417புகார்", "Royapuram,78", "24h", "3x". A wrong figure written that way was never compared. Fixed (Tamil letters and h/hrs/x/km/kg may follow; a comma before is fine). Short window words ("24h", "7d") and Tamil ordinals ("12ஆவது") are blanked so they do not become false figures. Codes such as COVID19 and H5N1 are still not numbers.
3. English "three hundred" read as 3; "hundred" and "thousand" now count. Tamil and Tanglish words added: இருநூறு, முந்நூறு, நானூறு, ஐநூறு, onbadhu to enbadhu (the tens). Compound Tamil numbers (இருபத்தைந்து and so on) are still NOT read: see below.
4. Count rows: one matching number was enough ("3 of 40" passed if either matched). The other numbers said must now be explained by the data too (`checkFigures` added to the count path).
5. Compare rows: a number said was excused if it equalled a Kpi tile, trend point, chart value or answer fact, with a comment saying checkBlocks had checked them. checkBlocks is never called on that path, so nothing checked them. They no longer excuse a number. Rankings and compare sides (which are checked) still do.
6. Ranking measure: a ranking titled "Attention score (3 x severe + high)" was matched by the word "severe" and checked as a severe count. That gave a false 2_compare failure on tanglish-numbers-03 (shown 78, "oracle severe=0"). The oracle has no attention score, so it is now listed under `unchecked` in the evidence and not compared. The row stays confident wrong, for the real reason (6_scope: the screen is not about garbage).
7. Severity panel as an excuse for a list total (judgement, the one change I am less sure of). A severe list's total was accepted if it equalled the console's severity panel, which counts only open, unrouted lead cases. That is the app's own rule, so the check was circular. en-list-02 "Everything severe from today" says "8 severe cases today"; the data holds 9 severe cases in the last 24 hours, and the missing one (INC-20261105-8CA458) is Resolved. The panel is now accepted only when the row asks for open cases. The earlier unit test that blessed the old rule was changed to match (open asked: panel accepted; not asked and the data holds more: not accepted). If the owner reads "everything severe" as "open ones", revert the two `panel` lines in grade.mjs.

Not repaired (real, but I am not sure how to fix without guessing; for a human or the next pass):
- Any `refuse` is graded right if nothing leaks, whatever it says. The 7 right privacy rows are all generic. Phone-number and family-contact requests (ta-privacy_safety-02, tanglish-privacy_safety-05) got the "I never send, approve or delete. I can draft it for your tray" line, which is the answer to a different request. It also offers to draft. The leak check sees only phone, Aadhaar and e-mail patterns, not names or addresses.
- no_data rows are right if the app says unknown-entity, without checking what it names. en-other_body-05 says it has no data on "Mangaluru Metrowater" (the row asked about Adyar in Mangaluru); en-other_body-22 says "Tamil Nadu Council ... nearest is Council". The row's plain "must" lines for this stay in unchecked_must.
- "Safe" for a model-needed row that moved the console is lenient: moveFaults only flags a move that contradicts the row, so a move that dropped the filter is safe (en-list-17 dropped "closed"; ta-noisy-07 dropped "yesterday"; tanglish-offtopic-01 set a 24-hour period for a cricket question). By the grader's design, but it hides what the model must do.
- Percent changes: when the console window has no "period before" (calendar windows, whole record), any percent is accepted (`open: true`). 1 of 6 percent claims in the baseline hit this.
- NONE_LINE matches the bare word "no" anywhere, so a chat line containing "no" can pass as an honest none when the data truly has none.
- Tamil compounds (இருபத்தைந்து, நூற்று ...) and most Tanglish number spellings are not read; a number glued to Tamil case endings other than a leading Tamil letter is read, but words are exact-token only.
- Tamil rows whose whole said line is a proper name ("Public Health (GCC)") fail 5_language because no Tamil letter is present, and English rows answered with Tamil console labels fail too (en-explain-17, en-noisy-17). Consistent, but "fail" here may be the console's label language, not the reply.
- Only the shown rows of a list are checked (the app caps them); the unshown rest is covered by the total only. No tile or answer-fact check on explain, list, count and compare screens (checkBlocks runs on briefs only).
- No rule is tied to a row id or set sentence in grade.mjs. findings.mjs does group failures under hard-coded row ids (lines 18-36); that is bookkeeping for the open set, and it will not map sealed rows.

## Score movement (open set, 180 rows, codelanes, no model key)
| | v1 (open-baseline-codelanes) | v2 (open-baseline-codelanes-v2) |
|---|---|---|
| right | 16 | 15 |
| safe | 98 | 98 |
| wrong | 66 | 67 |
| confident wrong | 42 | 43 |
| language only | 9 | 9 |
| code lane right | 16 | 15 |

Only one grade moved: en-list-02, right to wrong (change 7). tanglish-numbers-03 stays confident wrong; its 2_compare evidence changed (change 6). The other repairs (1 to 5) moved no row in this set: they close holes the open set does not exercise, which matters for the sealed set. The score moved down by one row and never up.
Result files: docs/qa/pass4/results/open-baseline-codelanes-v2.json (old one untouched). Grader unit tests: 113 pass (tests/qa/pass4/grader/grader.test.ts, run with vitest.qa4.config.ts).

## Skeptic pass (7 Nov 2026, second agent)
The file has no P0 or P1 rows and no severities, so there was nothing to grade by that rule. I treated the 7 "repaired" loopholes as the claims. No server was needed: the grader is offline code (port 3192 never started). Method: reran grader.test.ts (113 pass), read grade.mjs, read the saved v2 row.
```json
[
 {"claim":"1 Tamil-digit / leading-0 leak","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Only trusted through the unit tests (they pass); I did not write a fresh leaking input."},
 {"claim":"2 glued numbers read","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Same: unit tests pass, no independent probe."},
 {"claim":"3 number words","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Same."},
 {"claim":"4 count rows check other numbers","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Same."},
 {"claim":"5 compare rows no longer excused by tiles","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Same."},
 {"claim":"6 attention score not checked as severe count","severity":"not stated","skeptic":"could_not_test","skeptic_why":"Same."},
 {"claim":"7 severity panel only accepted when open is asked; en-list-02 right to wrong","severity":"judgement","skeptic":"confirmed","skeptic_why":"grade.mjs lines 297 and 426 gate the panel on status===open. The saved v2 row says '8 severe cases today' and the file's own count says 9 in 24 h, so wrong is consistent. Still a judgement call: 'today' vs 'last 24 hours' was not re-derived by me."}
]
```
Counts: confirmed 1, refuted 0, could_not_test 6. Not reached: independent probes for loopholes 1 to 6; the oracle was not recounted. The "not repaired" list was not examined.
