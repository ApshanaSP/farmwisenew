# QA Pass 5 — state

Start: **Thu Nov 12 09:23:08 IST 2026** (03:53:08 UTC). Five-hour budget ends 14:23 IST.

| Phase | Window (IST) |
|---|---|
| 0 Baseline | 09:23 – 10:03 |
| 1 Wave 1 | 10:03 – 11:53 |
| 2 Wave 2 | 11:53 – 13:13 |
| 3 Final gate | 13:13 – 13:58 |
| 4 Report | 13:58 – 14:23 |

Branch: `claude/qa-pass5-05abfd`, worktree `E:\farm\.claude\worktrees\qa-pass5-05abfd`, base `d45cf96`.

## Log

- 09:23 Started. Brief copied to `PROMPT.md`. Notes folder empty. Next: merge `7279522` (pass 4 tip).
- 09:34 Merge done (`393bd96`), 4 conflicts resolved (MERGE.md). Two seams fixed: P5-001 (`8939f46`), P5-002 (`2eb8548`). tsc clean.
- 09:37 **Incident, for the owner:** listing `.env` key names with `sed 's/=.*//'` also printed two `.env` lines that are bare Groq key strings with no `NAME=` in front (so they are not even read as settings). They appeared in this session's terminal output only: not in any file, log or commit. The owner should rotate those two Groq keys and delete the two bare lines from `.env`. From here on only names matching `^[A-Z_]+=` are printed.
- 09:38–10:02 Baseline: build OK (5m52s, .next-qa5 from 2eb8548). Unit suite 3237 tests: base-1 3 fails (P5-003, P5-004 fixed; RC-01 locality test timed out at 16.4 s under build load = flaky), base-2 67 fails caused by my own concurrent vitest runs sharing the Studio fixture port 4599 (not product bugs), base-3 and UTC 0 fails. Fixed P5-005, P5-007, P5-008. Wave 1 hunters done: manu-logic 17, manu-sec 12, sms-ocr 14, seam 8, click-layer 3 (stalled after its axe run).
- **12:40 Clock check: 3h17m elapsed, not ~45 min as assumed.** Pass 4's real-path suite (`vitest.qa4.config.ts`) took 2h41m on the loaded machine, and the golden recorder made no progress in 2h30m (killed, not recorded). qa4 suite on the merged tree: 2428 tests, 12 fail (pass 4 ended with about 70). Access matrix (extended with the desk account and Manu rules): 120 routes, 146 methods, 1170 cells, 9 fail; scope 41/41.
- Plan cut: fix tracker notes, the confirm-announce seam, the SMS double send and the desk login's reach by ~13:20; then the final gate (tsc, lint, 3 shuffled + UTC, build, matrix); report by 14:23. Wave 2 (pass 4 open list, redsec2, second hunt, journeys) is NOT run: listed as not done.
- 12:41–12:58 Fixed P5-009 to P5-019 and P5-029 (each fail-first and revert-checked; swept where the class could recur). Reviewer agent on P5-005/007/009/011/012/014 running since 12:49.
- 12:58 Final gate started on `6728c22`: tsc, lint, build into `.next-qa5`, then 3 shuffled suites (Kolkata) + UTC, access matrix and a browser drive on the build. A second reviewer covers P5-010, P5-013, P5-015..019, P5-029.
- 13:00 Reviewer broke P5-007 (16 cases) and found 2 gaps in P5-012: gate build on 6728c22 stopped; fixed in c832d8b and e6ade66 (revert-checked).
- 13:03 Final gate restarted on `e6ade66`. Reviewer2 (later fixes) still running.
- 13:05 Gate on `e6ade66`: tsc exit 0, lint 0 errors (13 warnings), build exit 0. Suites running (3 shuffled Kolkata + UTC). Next: server 3105 on the gate build, access matrix, browser drive, skeptic, report.
- 13:05–13:10 Gate run 1 on e6ade66 failed pass 4's RC-13 guard (my Tamil-only digit class in clean.ts); reviewer2 broke P5-016 (raw is_open) and P5-018 (shared LIMIT) and found P5-019 partial (P5-037 open). Fixed in f26d834, e364c24, 174cd6c (revert-checked). Probes removed; two kept in known-failures.
- 13:10 Final gate on `4dad870`: tsc exit 0, lint 0 errors / 13 warnings; build and suites running. Next: server 3105, access matrix, drive, skeptic, report.
- 13:12–13:18 Gate on `4dad870`: build exit 0; suites gate-1/2/3 (Kolkata, shuffled) and gate-utc all 3315 tests, 0 failed, 13 skipped; access matrix 1168/1170 (2 explained), scope 41/41; drive 28 page loads, 2 with a serious contrast issue (P5-038), petition journey passed. Skeptic launched 13:18.
- 13:18–13:52 Skeptic: every count recomputes; 10 sampled fixes hold; 9 of 10 works claims hold live. Its corrections applied (9b8921b, 4e7000c, 0435f74). Servers stopped, runtime folders and `.next-qa5` removed; pass 4's own pinned API (3199) left running, not ours.
- **Done 13:52 IST.** Final branch commit is the last commit on `claude/qa-pass5-05abfd`. Nothing pushed. The user asked for a second five-hour run in a new session: brief in `docs/qa/PASS6_BUG_HUNT_PROMPT.md` on this branch.
- 14:17 IST: the owner said "Yes, push it". Branch pushed to origin as `claude/qa-pass5-05abfd` at `5c082b7` (no PR, nothing merged into main). FINAL_REPORT.md and OWNER_SUMMARY.md describe the run before that push.
