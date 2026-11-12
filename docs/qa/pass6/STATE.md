# QA pass 6: state

- **Start:** Thu 12 Nov 2026 13:54:04 IST (08:24:04 UTC, epoch 1794471844), from `date` as the first action.
- **Five hours end at:** 18:54 IST (epoch 1794489844).
- **Branch:** `claude/qa-pass6-a84a72`, worktree `E:\farm\.claude\worktrees\qa-pass6-a84a72`, cut from `claude/qa-pass5-05abfd` at `5c082b7`.
- Nothing is pushed, merged or opened as a PR.

## Clock log
| Time (IST) | Elapsed | Phase / event |
|---|---|---|
| 13:54 | 0:00 | Start. Brief copied to `PROMPT.md`. |
| 13:55 | 0:01 | `npm ci` exit 0. Runtime files copied from pass 5's worktree (`.env` unprinted, `data/aws-cache` without `qa/srv` and `qa/golden`, `data/thunai`). `seed-local-users.mjs --pinned`: 7 accounts. Only port 3199 (pass 4's pinned API, not ours) was listening. |
| 13:56 | 0:02 | Phase 0 baseline on `5c082b7`: `tsc --noEmit` exit 0 (26 s); `next lint` 0 errors, 13 warnings (16 s). |
| 13:56–13:58 | 0:04 | Production build into `.next-qa6`: exit 0 (about 2.5 min). `tsconfig.json` and `next-env.d.ts` restored. |
| 14:02 | 0:08 | Golden `p6-base`: 3,277 requests in 190 s, 0 server errors, 0 problems, 3 gaps (the Manu routes have no sample ids; exit 2 for the gaps). Repeat `p6-base2` (14:02–14:06): 3 requests differ, all the same new complaint's map pin (lat/lon), the noise floor. |
| 14:06–14:10 | 0:16 | Unit suite on `5c082b7` (new test files held aside): base-1/2/3 (Kolkata, shuffled) and base-utc: each 3,315 tests, 3,302 pass, 13 skipped, 0 failed. |
| 14:10–14:13 | 0:19 | Future-clock runs (freeze-clock.cjs, ticking, +30/+90/+365 days): 6, 6 and 7 failures. 6 are tests that mix SQLite's own clock with the app's (P6-001, test limit); 1 is a test time bomb in studio.test.ts at +365 (P6-002). No product time bomb found. |
| 14:13 | 0:19 | Test server 3106 up (`.next-qa6`, pinned API 3197), accounts seeded. Access matrix baseline: 1,168/1,170 (the same 2 as pass 5), scope 41/41; 835 passing deny cells: 808 proven by the guard, 27 (9 methods) unproven. |
| 14:00–14:05 | — | Wave A hunters launched early, reading code only until the recording finished: redsec2, console-sync, officer-day, journeys, pass4-open (report by 15:35–15:40). |
| 14:20 | 0:26 | Fixed P5-022, P5-023, P5-024 (`d67ca78`) and P5-028 (`6d784d8`), each fail-first and revert-checked; guards green. |
| 14:24 | 0:30 | P6-003 (P1) found by sending a valid body to the matrix's unproven cells: staff accounts could file citizen complaints. Fixed `e65ac51`, revert-checked. Phase 0 done. |
| 14:33 | 0:39 | Fixed P5-031 (`3708211`). Reviewer 1 started on the first 4 fixes (report by 15:20). P6-004, P6-005 (P3) recorded from tracing pass 5's ML-16 probe (a harness artifact plus a silent "attached" on a failed live attach). |
| 14:37 | 0:43 | Fixed P5-030, P5-037, P5-039 (`ebe5810`), revert-checked; tsc, eslint on changed files and guards clean. Next: P5-026, P5-025, P5-038, P5-033, P6-002, P5-035; P5-027 is the owner's (TRUST_PROXY_HOPS behind the tunnel). |
| 14:39–14:51 | 0:57 | Reports in: redsec2 (15: 2 P0, 5 P1), officer-day (29: 6 P1), reviewer 1 (SMS fix partly broken; P5-028 budget dropped scan pages; 1 MB PDF blocks 8 s), pass4-open (80 items re-checked: 58 fixed, 17 still fail, 5 not reproduced; 4 P0). |
| 14:40 | 0:46 | P6-002 test time bomb fixed (`555a6cf`). |
| 14:59 | 1:05 | P6-006 (P0, redsec2-02) fixed `74788d7`: an officer's Ask District IQ opened another department's incident by id. Real-path guard test, revert-checked. |
| 15:03 | 1:09 | P6-007 (reviewer 1 on P5-028) fixed `a3937ca`. Reviewer 2 started on ebe5810, 555a6cf, 74788d7, a3937ca (report by 15:45). |
| 15:08 | 1:14 | P6-008 (P0, pass4-open-04) fixed `17f93d9`: a cut-off .xlsx hung the server thread. Next: redsec2-06 (P0 polish), reviewer 1's SMS points, redsec2-03/04/14, officer-day P1s. |
| 15:15 | 1:21 | P6-009 (P0, redsec2-06) fixed `bd1e802`: a complaint title could close its fence and lend Ask District IQ's writer a figure. |
| 15:18 | 1:24 | P6-010 (reviewer 1 on d67ca78) fixed `0bc6b9f`; pass 5's stale-'sending' test changed to the no-duplicate policy (explained in the commit). Reviewer 2 report: P6-006/P6-002/P6-007 hold; ebe5810 broken in 9 cases. |
| 15:20–15:23 | 1:29 | P6-011 (reviewer 2 on ebe5810) fixed `af2022e`; P6-012 (Ask the Map inc: refs, redsec2-09 / reviewer2-01) fixed `401d355`. Reviewer 3 started on 17f93d9, bd1e802, 0bc6b9f, af2022e, 401d355 (report by 16:05). |
| 15:26–15:32 | 1:38 | P6-013 (pdfImages regex and /Length, reviewer 2) `c641408`; P6-014 (planned-query department lock, redsec2-03) `5686976`; P6-015 (batch instruction on every case, officer-day-21) `f6cacf0`. Logout revocation (redsec2-04, PB-275) and the officer queue's window (officer-day-01) are design questions for the owner: Apshana's per-tab sessions (`f49b4ec`) and the console's Collector windows. |
| 15:34–15:37 | 1:43 | P6-016 (staff session after password change) `6508fe2`; P6-017 (Studio browser WebSocket/Service Worker SSRF) `c614e0d`. Reviewer 3 report: P6-010 and P6-012 hold; P6-008, P6-009, P6-011 broken; a map camera leak. |
| 15:46–15:55 | 2:01 | P6-018 (P6-008 after review) `56a9ecb`; P6-019 (P6-009 after review) `74e01ff`; P6-020 (P6-011 after review) `2d54ab6`. A Studio run at 15:39 hit the shared fixture port 4599 (63 false failures, all pass alone and on rerun). |
| 15:52 | 1:58 | console-sync and journeys reported 18 min late: both had parked in a background wait that never woke them, so neither ran against the server (console-sync: 14 findings from code reading; journeys: scripts written, not run). |
| 15:55–15:59 | 2:05 | Old server stopped; production build of `2d54ab6` into `.next-qa6` (exit 0, 3 min); server 3106 restarted and seeded. Wave B second blind hunt started: hunt2-sec, hunt2-ops, hunt2-desk (report 16:50). Reviewers 4 (P6-013..016) and 5 (P6-017..020) started (report 16:55). |
| 16:00–16:10 | 2:16 | The lead ran the journeys hunter's scripts on the fixed build: Collector morning (English), officer's day (stalled on a selector, no conclusion), petition desk to phone tracking (works). New: P6-022, P6-023 (P0, rules lanes), P6-024 (P1), P6-025 (environment). P6-021 (map nearest miss, reviewer 3) fixed `9202f3c`. |
| 16:17 | 2:23 | P5-038 (contrast of the citizen bottom navigation at 360 px) fixed `57670e6`. Ledger: 34 rows before the import of agent findings. Next: agents' reports, quick P0s, then the final gate. |
| 13:59 | 0:05 | Golden master `p6-base` started (serial, port 3107, pinned API 3197), nothing else running. Tools copied to `tests/qa/pass6/` (suite, bug, report, drive, lib, repro); `lib/live.mjs` now shares one cookie per account across processes (gitignored `data/aws-cache/qa/run/cookies-<port>.json`), because sign-in allows 8 tries per e-mail in 15 min. `vitest.p6probe.config.ts` added. |
| 16:48 | 2:54 | Fixed since 16:17: P6-026 `8b606c4`, P6-027 `589d22b`, P6-028 `bf50474`, P6-029 `8c81781`, P6-030 `24f534c`. Reviewers 4 and 5 and the three wave B hunters reported; all findings imported (184 rows: 32 fixed, 139 open, 13 owner). Probes moved to `tests/qa/pass6/known-failures/`. Test server 3106 stopped. |
| 16:49 | 2:55 | **Stopped: the usage limit was reached.** NOT done: the final gate (`bash tests/qa/pass6/gate.sh` from chennai-grievance-portal-main: tsc, lint, 3+1 suites, guards, build, golden p6-gate + diff, matrix with valid bodies, browser drive), the gate's red team, `evidence/golden-explained.md`, `OWNER_SUMMARY.md`, the skeptic. `FINAL_REPORT.md` was generated before the gate. Last full-suite run: baseline only (all pass); the fixes were checked with their own tests, the folders they touch, tsc and the guard files. |
| 21:03 | (after the window) | Resumed after the usage limit, past the five-hour window (it ended at 18:54; the run used 2 h 55 min of it before the limit). The final gate started on `effe51b` (`tests/qa/pass6/gate.sh`, one job at a time); the gate's red team started in parallel on code and mocked probes only (no server, no build, no default vitest). |
| 21:03–21:26 | (after the window) | Final gate on `effe51b`: tsc exit 0; lint 0 errors / 13 warnings; unit suite gate-1/2/3 (Kolkata, shuffled) and gate-utc: 3,441 tests, 3,428 pass, 13 skipped, 0 failed each; guard files and pass 6 real-path tests all pass (three run just after the script, same commit); build exit 0; golden `p6-gate`: 15 changes vs `p6-base`, 12 from P6-028 and 3 the noise floor (`evidence/golden-explained.md`); matrix 1,168/1,170 (the same 2), scope 41/41, deny cells proven 812 / unproven 23; drive 28 loads, 1 with axe serious (P6-031), petition journey passes. |
| 21:22 | — | Gate red team: P6-029 and P6-030 broken in new ways, P6-027 in part (open rows); the rest hold (mostly by reading). |
| 21:27 | — | Owner summary written, report regenerated, committed `b0e65fc`. Skeptic started on the final files (server 3106 left up for it). |
| 21:28–21:41 | — | Skeptic: every count holds and all 14 reverted fixes fail without their fix; the owner summary overclaimed in places. Verdict quoted word for word in `report-notes.md`; the summary, the report generator (agent-row count, golden lines, push note) corrected after it. |
| 21:43 | — | **Done.** Test server 3106 and this run's pinned API (3197) stopped; `.next-qa6` and the per-server runtime data removed. Pass 4's pinned API (3199) left running, not ours. Nothing from pass 6 pushed. |
