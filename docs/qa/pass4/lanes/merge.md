# Merging the four fix lanes (7 Nov)

Order: lane c, lane a, lane d, lane b, into claude/qa-pass4-ecfcb9. Before it: lane a's uncommitted runs and ledgers were copied in and committed; the first-round reviews of lanes c and b were saved from the reviewers' results (`docs/qa/pass4/reviews/c-review.md`, `b-review.md`; the journal held both texts).

## Conflicts and what was kept
- Lane c: no conflict (package files moved to Next 15.5.29 and React 19; `npm ci` run).
- Lane a: no conflict. The `tok in EN_NUM` and `tok in LOAN` lookups in `normalise.ts` were already `Object.hasOwn` (lane a, RC-14).
- Lane d: one conflict, `audit-understanding.test.ts` (lane a made ten overdue-list tests `it`; lane d kept one of them `it.fails` because it did not have lane a's fix). Both fixes are in, so all ten are `it`.
- Lane b: three conflicts. `screens.ts`: lane b's console list is the main path; lane a's fallback (read the overdue pages until a screenful, each case once; resolved is the name `Resolved`) stays for hands without the list, both through `incidentList`. `audit-ui_honesty.test.ts`: lane d's `||`. `audit-narrate_and_figures.test.ts`: the "console's groups" test is `it.fails` again, as lane b says (groups against incidents cannot both hold).
- Not a conflict, but put right: lane b had changed `props.pass4.test.ts` property-1 (fullwidth, Arabic-Indic and Devanagari digits) to `it` although no lane fixed it; it is `it.fails` again (open).
- Lane b's review: both texts are in `reviews/b-review.md` (recovered from the agent's result).

## Fixes made in the merge
1. `numbergate.ts`: `EN_WORDS[w] != null` / `TG_WORDS[w] != null` read a prototype word (constructor, toString) as a number word. Now `Object.hasOwn`. `scans-code-2` (flipped to `it` by lane b without a fix) passes.
2. `screens.ts`: "54 of the 52 are past their deadline" (severe list: the severity panel's rows against incidents). Said without the whole when the part is larger. New test in `figures.pass4b.test.ts` (fails before: 10 of the 2). The unit decision (groups or incidents) stays open for the owner.
3. 19 tests that were `it.fails` now pass because the lanes together fixed them, so they are `it` now: hunt-redai (REDAI-1, 1b, 1c, 1d, 2, 2b, two of the four REDAI-3 inputs, both REDAI-4 inputs), hunt-jarvis1 (1, 5, 9), hunt-jarvis2 (8), audit-understanding-10 (two inputs) and 16 (two inputs), same-number-9 (Jarvis "All cases"). The inputs that still fail stay `it.fails`.

## Numbers
- Default suite (`npx vitest run`): after lane c 2543 passed; after a 2590; after d 2652; after b 2661 passed and 1 failed (the props.pass4 property-1 above), then 2663 passed and 0 failed with that test back to `it.fails`, the new test and the flips (final run, 177 files). `tsc`: no error in `src/`; 21 errors in `tests/qa/pass4/*.test.ts` (typing of tests written by the earlier agents, the same count after every merge).
- Grader, open set, code lanes (`QA_P4_SET=open QA_P4_LABEL=merged`), against `open-baseline-codelanes-v2`: right 15 to 51, safe 98 to 98, wrong 67 to 31, confident wrong 43 to 18, wrong in language only 9 to 8. Right to wrong: **0**. Rows that fell (safe to wrong, 7, all already in lane a's own ledger and not explained in its notes): ta-brief-20, ta-explain-14, ta-explain-16, ta-noisy-07, tanglish-explain-08, tanglish-explain-20, tanglish-numbers-11. Rose: 53. Ledger: `results/ledger-open-baseline-codelanes-v2--merged.md`.
- Golden: 278 changed, 1 added, 1 removed against the baseline; see `golden/explained/merged.md`.

## Docs check (every row of lanes a to d: its test passes after the merge)
Run in `vitest.qa4.config.ts` after the build (one run of 2164 tests, 83 failed before the flips above, 14 of them flipped). Files named in the lane rows and their state in that run:
- Pass: lane-a.pass4, resolver.pass4, figures.pass4b, privacy.guard, exitgate.guard, ask.pass4, secrets-kept, effective, effective.guard, metrics, parse-period, guards.pass4, turn, ta.pass4, deadline.pass4 (default suite), and in the qa4 config open-baseline.findings, skeptic-b, lane-c.guards, c-skeptic, d-skeptic, decision-matrix, invariants-app, golden-baseline, audit-client_browser.
- **Still failing after the merge, not fixed in the time:**
  - `audit-understanding.test.ts`: 14 (audit-understanding-15 six, -17 three, -19 two, -20 three). Plain `it` tests; I did not trace whether lane a or d fixed them in their own tree or they come from a join.
  - `audit-narrate_and_figures.test.ts`: 29 (for example AUD-NF-2 "yesterday counts 5 Nov": 239 against 245).
  - `same-number.test.ts`: 12 (surface and pair comparisons against the oracle), same-number-3 among them.
  - `metamorphic.test.ts`: 1 (m30:tanglish, the two spellings give different lists).
  - `scan-findings.test.ts`: 1 ("the production build compiled the code helper away": the Next 15 bundle looks different).
  - `model-lifecycle.test.ts`: 2 (`fetch failed`: the test's server did not answer), `hunt-askiq`, `skeptic-askiq`, `audit-ui_honesty`: servers did not start or answer in that run (port 3120, 3134, 3142, 3173, ECONNREFUSED); a re-run alone is needed, not done.
  - Outside the lane rows: `flaky-parsewhen-tz` (2; the test depends on the machine's time zone), `chaos-findings` (1).
  I could not tell in the time which of these were also red inside the lane trees before the merge (the lanes ran their own subsets). They are not counted as fixed. The first thing to do next is to run each failing file on its lane's tip, and on the merge, in a quiet machine.

## Servers
No server of mine is left running (ports 3201 and 3120 stopped).
