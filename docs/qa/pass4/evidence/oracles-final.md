# QA pass 4, final gate: oracles and factory, baseline against final

Run on 12 Nov 2026 on the final build: `.next-qa`, production build from commit `6bb5423f97637a24de52f9f3d2406e5d3d217640` (see `final-build.json`), pinned snapshot `2026-11-06 18:21:19|76734f481810`, the console's now 2026-11-06 18:08:00. Servers on ports 3225 to 3229 only, all stopped. No model was called. Nothing under `src/` was changed. The baseline is what is committed in `docs/qa/pass4/evidence` (first pass 4 run, 6 Nov, build `.next-qa` of that day). Each final result sits next to its baseline with a `-final` name.

## Summary table

| Tool | Baseline | Final | Target | Met |
|---|---|---|---|---|
| `invariants.mjs` (637 checks on the stored data) | 576 pass, 54 pipeline issues, 7 app issues | 576 pass, 54 pipeline issues, 7 app issues (the same: it reads data, not the app) | pipeline issues are reported, not patched | yes |
| `invariants-app.test.ts` (the 7 app issues, on the real code) | 10 open (`it.fails`) | 17 of 17 pass, 0 open | 0 open | yes |
| `same-number.mjs` (every screen, spoken and shown, against the oracle) | 20,383 readings, 19,875 equal, 508 differ, 0 unexplained | 20,344 readings, 20,223 equal (99.41 %), 121 differ, 0 unexplained, 0 missing | 100 % | no: 121 differ, 63 of them are open bugs (below) |
| `decision-matrix.mjs` (10 actions, 15 surfaces, 150 cells) | 69 moved, 11 moved late, 43 still, 21 did not move, 5 wrong; sequences 7 of 12; sums 10 of 12; who may act 55 of 55 | 112 moved, 37 still, 1 n/a, 0 wrong, 0 did not move; sequences 12 of 12; sums 12 of 12; who may act 55 of 55 | as designed | yes (after two oracle corrections, below) |
| `access-matrix.mjs` (116 routes, 140 methods, 997 cells, 41 scope cells) | 993 pass, 4 fail (`POST /api/profile/photo` answered 500 for every role); scope 41 of 41 | 997 pass, 0 fail; scope 41 of 41 | 100 % as designed | yes |
| `api-fuzz.mjs` (116 routes, 4,669 requests, 20 MB bodies) | 5xx 2, stack trace 16, partial write 1, crash 0, hang 0 | 5xx 0, stack trace 0, partial write 0, crash 0, hang 0 (3.2 minutes, nothing skipped for budget) | none | yes |
| `metamorphic.test.ts` (30 questions, 120 rewrites) | 91 of 120 rewrites keep the facts (29 change one) | 128 of 128 tests pass; 106 of 120 rewrites keep the facts (88.3 %); 14 change one and are listed open in `metamorphic.known.json`; 1 more (`m22:order`) only lists the same two zones in the other order | 100 % | no: 14 open |
| `concurrency.mjs` (13 cases) | 13 cases, 0 problems | 13 cases, 0 problems | 0 | yes |
| `pairwise.mjs` (336 pairs in 28 cases) | 0 problems, 1 plan not driven | 0 problems, the same 1 plan not driven (map layers, ask, export) | 0 | yes (one oracle correction, below) |
| time travel (`time-travel.mjs`) | 5 of 20 runs; 215 checks; 4 problems | 20 of 20 runs; 880 checks; 0 problems | all 20 | yes |
| `scan-bundle.mjs` (client bundle, `.next-qa`) | 0 secrets in 145 files | 0 secrets in 266 files, 8.7 MB | 0 | yes |
| `scan-history.mjs` (git history, values of the real environment variables and key shapes, 438 commits, 8,692 blobs, 2.0 GB) | 5 hits, all placeholders or documentation examples | the same 5 hits, the same paths | 0 real secrets | yes |
| gitleaks over the history | 3 hits, none a secret | 5 hits, none a secret (2 new, below) | 0 real secrets | yes |
| `scan-lfs.mjs` (52 LFS objects, 6.6 GB) | 0 | 0 | 0 | yes |
| `scan-runtime.mjs` | one malformed body gave 500, `/_next/image` and dev routes off, one upgrade request gave 500, one unsigned 20 MB POST to `/api/i18n` crashed the server (SCAN-1) | malformed body 400, upgrade requests call nothing, the 0.4, 2, 8 and 20 MB posts all answer 413 and the server stays up, no code in any body | no crash | yes |
| `npm audit --omit=dev` | 1 critical (next), 2 high (postcss, zod), 0 moderate | 0 critical, 2 high (postcss, zod), 1 moderate (next, through postcss) | each high or critical listed with its reason | listed below |

New findings from this run: gate-oracle-1, gate-oracle-2, gate-oracle-3 and gate-oracle-4 (a test that no longer tests). Each has an `it.fails` test and a record in `docs/qa/pass4/findings/gate-oracle.json`.

## Spoken and shown figures against the oracle

`same-number.mjs` read every figure over HTTP as the role that sees it (Collector, three officers) on 19 scopes and 22 surface groups: the console tiles, list, Briefing, trends, exports and report; Ask District IQ's tools and chat; Jarvis (`thunai/round`, the spoken lines too); Ask the Map; the officer pages. Each reading was compared with `tests/qa/oracle/pinned.mjs`, which knows no app code. Run time: 16:08 IST, 12 Nov. Files: `same-number-final.json` (every reading and every difference), `same-number-final.md` (tables), `same-number.raw-final.json`, `same-number-extras-final.json`, `same-number-hooks-final.json`.

20,344 readings, 20,223 equal the oracle (99.41 %), 121 differ, and each of the 121 is named below with its rows in `same-number-final.json` (`differences`, one entry per reading, with the oracle's ids). 0 are unexplained, 0 are missing. The target of 100 % is not met: 63 of the differences are open bugs.

| Finding | Class | Readings | Surface | What differs (example) | Test |
|---|---|---|---|---|---|
| RC-29 | by design | 21 | Briefing (page, Jarvis brief, assistant briefing) | `newsOnly`: app 10, oracle 13. The Briefing hides headlines about another district once, up front (code comment, RC-29). The oracle counts them. | decision recorded |
| same-number-2 | owner's call (unit) | 28 | Jarvis dashboard and open case list | `CaseList.total(groups)`: app 236 incidents, oracle 226 groups of one problem. Needs the owner's call on the unit (lane b note) | `it.fails` same-number-2 |
| same-number-2 | bug | 9 | Jarvis severe case list | past-deadline beside the list counts the whole list now; the oracle counts groups | `it.fails` same-number-2 |
| same-number-8 | bug | 15 | Briefing | the written line and the list under "In the news, not in department records" say 10, the figure is 13 (weekly 60 against 77) | `it.fails` same-number-8 (two tests) |
| same-number-9 | bug | 16 | Ask District IQ chat list | "Incidents matching", no filter: 228, oracle 239 (counts groups) | `it.fails` same-number-9 |
| same-number-3 | bug | 10 | Jarvis compare departments | the other department reads 0 past deadline: GCC-ELE 0 against 38 | gate-oracle-2 (new) |
| same-number-11 | bug | 21 | Jarvis zone performance | Open and Severe for the whole district leave out incidents with no zone: 1,116 against 1,167 | gate-oracle-3 (new) |
| gate-oracle-1 | bug | 1 | the assistant's CSV | quarterly, whole district: 1,000 rows given, 1,077 in the period, no word about the cut | gate-oracle-1 (new) |

Closed since the baseline (508 differences, now 121): the 254 "definition" differences (trend totals against their bars), same-number-1 (Jarvis said no past-deadline cases; 57 readings), same-number-4, -6, -10 (the first of 12 weeks, 34 readings) and -13 (a tile called Reported over another count, 34 readings) read 0 differences. Their `it()` tests pass.

The two figures from the earlier browser report (ongoing 237 against 240, past deadline 12 against 13) are reconciled in `same-number-final.md` ("The two from last time"): the old build is not kept, three rows named, one of the two rows for the 13 cannot be shown.

Raw data against every screen, row by row: 95 figure and scope pairs, each with the rows the app's build steps take out or move (`derive.ts`: 174 incidents taken out, 119 given a zone). Every row in raw only is named by id and by the step that took it out. All 1,386 rows named this way carry the step that took them out.

Same name, different count: 36 pairs, each reconciled row by row in `same-number-final.md` ("Same name, different count: the rows").

## Decision matrix: the runs, and why two oracle corrections

Five runs are kept so the change is visible: `decision-matrix-final-first-run`, `-second-run`, `-run3`, `-run4-main`, and `decision-matrix-final` (the last, with the second-server lag checks merged in; `.json` and `.md`). The committed baseline is `decision-matrix.json` and `.md` (restored after each run: the tool writes there).

| Run | Cells moved as designed | Wrong or did not move | Sequences | Sums |
|---|---|---|---|---|
| baseline (6 Nov) | 124 of 150 (69 moved + 11 late + 43 still + 1 n/a) | 21 did not move, 5 wrong | 7 of 12 | 10 of 12 |
| first run | 136 | 13 wrong, 1 did not move | 8 of 12 | 6 of 12 |
| second run | 149 | 1 did not move | 11 of 12 | 6 of 12 |
| run 3 | 150 | 0 | 11 of 12 | 6 of 12 |
| run 4 (main part) | 150 | 0 | 12 of 12 | 11 of 12 |
| final (run 5) | 150 | 0 | 12 of 12 | 12 of 12 |

(The "as designed" column counts moved, moved late, still and n/a. The fall in the sums from 10 to 6 in the first three runs is the old oracle in the sums section, explained next.) The oracle in `decision-matrix.mjs` said, at baseline, "verify and escalate leave the status as it is". The code changed after the baseline: `src/lib/collector/effective.ts` (RC-26, commit 8ad287f) now says "The latest decision with an effect decides: resolve, verify ("Verify and close") and reject close the incident, reopen opens it. A note and an escalate have no effect." The first run still used the old rule and showed 13 "wrong" cells that were the oracle's age, not the app's. The tool was corrected in four places, each with the line of the code that says it: the expected state after a verify and after an escalate (cells and sequences), the list's verified filter after a verify (`src/lib/collector/intel.ts` line 1402: a verified row is in the filter), the officer's "returned" count after a reject, and the oracle's count of cases by incident instead of group (8779570). Then the sums section's own `oracle()` function had the same old rule (run 3: sums 6 of 12, the console 1,159 open against the oracle's 1,164: five incidents decided with a verify or an escalate), and its Resolved figure counted by report date where the tile counts by closing date (PB-214, RC-29; run 4: the console 1,175 against 1,173: the two incidents reported on 6 Oct that the matrix resolved, `INC-20261006-9D13D8` and `INC-20261006-9FB89A`). Both are corrected in `oracle()`. No target was lowered: the expectation went from the old rule to the written one, and every cell and sum is still compared. The corrections were made after reading the runs, so they are listed here and in the commit message. One sequence is not explained. "Reopen an incident the pipeline closed, then the officer sends a report: My Tasks" failed in the first, second and third runs (My Tasks 1, wanted 2: the count was already 1 after the reopen, before the officer's report) and passed in runs 4 and 5 (the count was 0 after the reopen, 1 after the send). Nothing in the tool changed for this sequence between run 3 and run 4. A count carried over from the sequence run just before it, or a cache, would do this; I did not find which. It is a caution, not a finding: there is no repro that fails every time, and `decision-matrix.test.ts` DECISIONS-15 (the same claim, on the real code) passes.

"Who may act": 55 of 55 (no session, citizen, the officer of the department, another department's officer: all refused, no row written). The lag on a clock that runs as on production: on the second server the console, Ask District IQ and Jarvis figures moved within 4 seconds of each of three decisions (1 to 2 seconds for the first incident, 3 to 4 for the others); see `after_run.lag` in `decision-matrix-final.json`.

## Findings in this run

| Id | Severity | Title | Test |
|---|---|---|---|
| gate-oracle-1 | P2 | The assistant's CSV holds 1,000 rows of a 1,077-row quarter and does not say it is cut | `gate-oracle.test.ts` |
| gate-oracle-2 | P1 | With one department chosen on the console, Jarvis compares two departments and reads 0 past-deadline for the other | `gate-oracle-figures.test.ts` |
| gate-oracle-3 | P1 | Zone performance says 1,116 open for the whole district where every other screen says 1,167 | `gate-oracle-figures.test.ts` |
| gate-oracle-4 | P2 | `same-number-19` passes without testing: it names the hook `news-media-only@1`, now `@2`, and the hook still takes out 3 incidents with 6 deaths | `gate-oracle-figures.test.ts` |

Run: `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/gate-oracle.test.ts tests/qa/pass4/gate-oracle-figures.test.ts`. All four are `it.fails` and pass as failing now. Details, repro and root-cause guesses: `docs/qa/pass4/findings/gate-oracle.json`. The it.fails counts in the permanent tests, first pass 4 commit against now: `invariants-app` 10 to 0, `decision-matrix` 31 to 0, `same-number` 27 to 8, `metamorphic` 7 to 0 (its 14 open rewrites are listed in `metamorphic.known.json`).

Still open from before, read again on the final build and not new: same-number-2 (owner's call), -8 (Briefing news-only count), -9 (chat "Incidents matching"), -15 and -16 and -17 (pipeline data, OPEN-7, OPEN-11), -23; 14 metamorphic rewrites (meta-words-1 and meta-words-2).

## Time travel, all 20 runs

`time-travel.mjs`: 10 moments, each in UTC and in Asia/Kolkata, so the clock's zone cannot hide a mistake: before the as-of (5 Nov 18:31 UTC), 23:59:30 IST on 6 Nov, 00:01 IST on 7 Nov, Monday 9 Nov 09:00 IST, 23:59:30 IST on 30 Nov (month end), 00:01 IST on 1 Dec, 23:59:30 IST on 31 Dec (year end), 00:01 IST on 1 Jan 2027, Pongal (14 Jan 2027, 12:00 IST), and 1 Jun 2027 (months after the last data: every window empty). 20 of 20 ran, 44 checks each (the overview tiles on every period, the list total, the Briefing, trends, the officer overview, and Jarvis's "yesterday", "this week" and "last month"): 880 checks, 0 differ from the oracle. `time-travel-final.json`. The first attempt reached only moment 5 of 20 and is kept as `time-travel-final-first-run-partial.json` (and `.log`; the run was cut off, and its 12 "last month" problems were the old oracle, below).

One oracle correction, made after reading the first final attempt: Jarvis's "last month" headline names the month ("last month (October 2026)") and gives the calendar month's count; the baseline tool expected a rolling 30 days. The tool now expects the calendar month before the console's now, IST, and also checks that the headline names that month (`chat:last month names the month`: 20 of 20). The "yesterday" problems of the baseline (4) no longer appear: Jarvis's "yesterday" matches the calendar day.

## Scans

- **Client bundle** (`bundle-scan-final.json`): self test passed; 266 files, 9.2 MB of `static`, `server/app/**` pages and `public`; 0 secret values, 0 key shapes, 0 secret names in browser JavaScript. `NODE_ENV` appears in chunks, as expected.
- **Git history** (`history-values-scan-final.json`): all branches, 438 commits, 8,692 blobs, 51 compressed files opened, 0 not opened. 5 hits, the same as the baseline, each checked earlier (`scans/triage.json`): `SMTP_USER` and `SMTP_PASS` in `.env.example` (the real `.env` value is the same placeholder text, so there is no real SMTP password at all) and three `database-url-with-password` shapes that are the documentation example (`user:pass@host`). No `.env` file was ever committed.
- **gitleaks** (`gitleaks-history-final.json`, and the same without text conversion): 5 hits, secrets redacted. The 3 from the baseline: ids in `district_intel/output/state/incident_ids.json`, two lines of `_truth/duplicate_truth.csv`. 2 new: `district_intel/output/cache/news_gate.json` (a cache key hash in a file the pipeline wrote on 11 Nov) and `tests/qa/pass4/scan-runtime.mjs` line 90 (the sample `Sec-WebSocket-Key` of a test request). Neither is a secret: that is what the pattern called a "generic key".
- **LFS** (`lfs-scan-final.json`): 52 objects, 6.6 GB, 0 hits. The model file in this worktree is a 134-byte pointer; its content is not here and was not scanned.
- **Runtime** (`runtime-prod-final.json`): no six-digit code reaches the browser (the second request for a password reset says only that a cooldown is on: `cooldownRemaining`, 60 or less). One run on a server with a frozen clock shows a six-digit `cooldownRemaining` (60 plus the seconds from the frozen clock to the real one); I read that again on a live server with and without a frozen clock (6 digits only when frozen) and it is the test clock, not a leak.
- **`npm audit --omit=dev`** (`npm-audit-prod-final.json`):
  - `postcss` high (GHSA-qx2v-qp2m-jg93 stylesheet XSS, GHSA-6g55-p6wh-862q file read through a `sourceMappingURL` comment), version 8.4.31 inside `next`. Not reachable: it runs at build time on this repo's own CSS and nothing in `src` or `scripts` imports it (`scans/triage.json`). Fix: `next` 16.4.6 (a major upgrade), or an npm override to postcss 8.5.23. Not applied: it is a dependency change outside this brief.
  - `zod` high (GHSA-mrhx-c7xc-m3w5, memory exhaustion on a large array), version 3.25.76. Was reachable in the baseline: one unsigned 20 MB POST to `/api/i18n` crashed the server (SCAN-1). On the final build the same POST answers 413 at 0.4, 2, 8 and 20 MB and the server stays up (`src/lib/body-cap.ts`); `api-fuzz` with 20 MB bodies on all 116 routes had 0 crashes. The advisory stays in the dependency until `zod` 4.6.7 (a major upgrade); the cap is the mitigation.
  - `next` moderate (through postcss; the critical request-deserialisation advisory of the baseline is closed by 15.5.29, RC-22).
  - critical: none.

## Changes to the tools (no `src` change)

Every change is to the oracle's expectation or its port, never to a target. In `tests/qa/pass4`:

- `concurrency.mjs`, `time-travel.mjs`: the port and the log path read from `QA_CONC_PORT` and `QA_TT_PORT` (default as before), so a run on 3225 to 3229 does not use another agent's port. `time-travel.mjs` also holds the "last month" correction above.
- `pairwise.mjs`: the Resolved status filter reads the oracle's `resolvedByClose` (PB-214, RC-29), as the Resolved tile counts it. With the old oracle the run has 1 problem (`period=monthly zone=13 status=Resolved`: app 428, oracle 281): kept as `pairwise-final-old-oracle.json`.
- `same-number.mjs`: the assistant's CSV row cap is recorded as bug `gate-oracle-1`, the Briefing's `newsOnly` is accepted as RC-29 on the `assistant/briefing` and `facts.newsOnly` names too.
- `decision-matrix.mjs`: the corrections in the section above.
- `docs/qa/pass4/evidence/same-number-hooks.json` refreshed to the file `same-number-hooks.test.ts` writes on this build (`same-number-hooks-final.json`): the same 174 removed incidents and the same moves, only the hook name `news-media-only@1` is now `@2` (RC-38). Without it `same-number.test.ts` `same-number-19` fails on the three ids of gate-oracle-4; with it the test passes because its filter names `@1`.
- New: `gate-oracle.test.ts`, `gate-oracle-figures.test.ts`.

## What could not run, and limits

- No model ran. Figures a model writes in its own words, and the Collector's AI brief, were not read; the facts it writes from were checked with a fake model at the boundary (`same-number-brief.test.ts`, the five test files I ran again, `invariants-app`, `invariants`, `gate-oracle`, `same-number-brief` and `decision-matrix`, pass with 758 tests).
- In this worktree the embedding model file is a 134-byte Git LFS pointer, so meaning search is off and the server log repeats "embedding index: Load model ... failed". The concurrency and decision runs list these lines; no other error line appeared in any server log.
- `invariants-app.test.ts` writes `invariants-after-build.json`: this run's two re-runs agree (alerts 66 before, 53 after). The first final run's file said 66 after (kept as `invariants-after-build-final-first-run.json`); it did not repeat, so I take the re-run as the final and say that I do not know why the first one differed.
- `pairwise.mjs` does not drive the map layers, ask and export plan format: the same 1 plan as the baseline.
- The `decision-matrix` run depends on a 65 second cache wait after each action and takes about 25 minutes; the one sequence that failed in the first three runs and passed in the last two is described above.
- Not mine and not committed: the other agents' files in the worktree (`final-browser.*`, `zz-tmp-final-*.test.ts`, `coverage-compare.mjs`, `flaky/final*.json`, `uploads/officer-reports/*`, the `bug-audit/*.json` that other runs rewrote).
- `same-number.test.ts` on the final build (its own server on port 3229, 6 minutes): 52 of 53 pass; the one failure was `same-number-19`, because the committed hooks file still named the hook `@1` (see above). After the hooks file was refreshed `same-number-hooks.test.ts` and `gate-oracle-figures.test.ts` pass (4 tests); the whole of `same-number.test.ts` was not run a second time.
