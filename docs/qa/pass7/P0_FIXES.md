# QA pass 7: pass 6's open P0s, and everything merged into one branch

Branch `claude/elated-yalow-26931a`. This session pushes nothing and opens no PR: the pass 5 session holds the owner's "push to main" and
pushes the gated tip itself (GitHub main had `1df591f0` from this branch when this was written). The final gate ran on `7e815c53` and is
green (section 6); the commits after it change only the gate script's clean-up step and documents.
The owner asked for "all bugs" to be fixed at once, so the work ran as six parallel sessions ("lanes"), each in its own worktree with its own
files and ports, and everything was merged here: the six lanes, the pass 6 session's own fix branch (`claude/fixall-a84a72` at `bb50d5f6`:
P1-P3 rows outside the lanes' files), a fix it had parked (`claude/fixall-repeat-reviewer5`), and QA pass 4's final commit `eec8c840`
(47 commits written before pass 5, which the owner asked to have merged in). One ledger for all of it: `docs/qa/pass6/BUGS.json`; the
counts are in the regenerated `docs/qa/pass6/FINAL_REPORT.md`.

## 1. The 14 open P0 rows from pass 6
| Row | What was wrong | State | Fix (lane) | Test that fails without it |
|---|---|---|---|---|
| redteam-gate-05, reviewer5-04 | a whole .xlsx whose deflate stream never ends hung SheetJS on the server thread | fixed | `860b8b0` (studio-parse) | `tests/qa/pass7/studio-parse/reader.test.ts` |
| reviewer5-09 | an XML of comments made the feed pattern backtrack for minutes on the server thread | fixed | `860b8b0` (studio-parse) | `tests/qa/pass7/studio-parse/pages.test.ts` |
| redteam-gate-01 | a site answering the route's GET 200 and the browser's 302 to 127.0.0.1 reached this computer | fixed | `68c8504` (studio-egress) | `tests/qa/pass7/studio-egress/browser-fence.test.ts` |
| redteam-gate-04 | a form POST answered 307 to 127.0.0.1 reached the private service | fixed | `68c8504` (studio-egress) | same |
| reviewer5-06 | a figure planted in a news headline passed Ask District IQ's writer check | fixed | `2a80443`, `c540add` (askiq-writer-lock) | `src/lib/assistant/polish.pass7.test.ts` |
| reviewer4-01 | an officer's query joined back to incidents listed other departments' cases | fixed | `d9083aa`, `c540add` (askiq-writer-lock) | `src/lib/assistant/compile.pass7.test.ts`, `tests/qa/pass4/p7-askiq-join-lock.guard.test.ts` |
| P6-022 | "new complaints today" answered with this week's cases | fixed | `ff5783b` (rules-periods) | `periods.real.test.ts` (rules-periods) |
| P6-023 | "severe incidents open right now" said 0 (read as the last 24 hours) | fixed | `ff5783b`, `e0ef451` (rules-periods) | same |
| pass4-open-16 | "last month" was the rolling 30 days | fixed | `ff5783b` (rules-periods) | same; pass 4's open-baseline-8 is a plain test now |
| pass4-open-17 | "up or down from last month" got a list, not a comparison | fixed | `ff5783b` (rules-periods) | same; open-baseline-14 plain |
| **pass4-open-18** | Tamil/Tanglish give other facts than English (7 metamorphic pairs) | **partly**: 5 of 7 fixed; m03:tanglish and m08:ta still differ (the KNOWN list went from 20 to 7) | `ad4d125`, `a6875cb` (rules-periods), pass 4's late fixes | `tests/qa/pass4/metamorphic.test.ts` |
| hunt2-ops-07 | resolving an already-resolved case counted it again as resolved today | fixed | `94e134b`, `9fd0825` (collector-ops) | `src/lib/collector/effective.redate.sqlite.test.ts` |
| hunt2-ops-12 | the briefing's opening said "more incidents" while the live figures said 78% fewer | fixed | `0d9b333`, `65f46d8` (collector-ops) | `src/lib/collector/opening.test.ts` |

Every fix has a test that failed on the old code and a revert check (the fix taken out, the test fails, put back, it passes), recorded in its
ledger row. The mechanisms the summary asked for:
- **Studio files** are read in a separate process (`src/lib/studio/parse-pool.ts` runs `scripts/studio-parse-worker.mjs`, a committed bundle
  of the parse code; `tests/qa/pass7/studio-parse/bundle.test.ts` fails when it is older than the code) with a time limit and a memory
  watchdog. A process, not a worker thread: a worker's `resourceLimits` aborted the whole server near its limit. The Collector's source
  onboarding and its scheduled source runs read pages there too (p7-studio-parse-12, P0, `d7e4442b`).
- **The Studio browser** sends every connection through an egress proxy that resolves the host itself, refuses private, loopback and
  translated addresses, and connects to the address it checked; a connection that bypasses it is closed (redirects, POST 307/308,
  WebSockets, workers, WebRTC). A fresh reviewer tried 81 attacks and broke none.
- **Ask District IQ's writer** takes figures only from the card's typed values (`src/lib/assistant/figures.ts`), never from text.
- **The rules lanes** (Jarvis and Ask District IQ) read time through one reader, `src/lib/period/read.ts`, which takes counted spans from
  pass 4's property-tested `lib/windowspan.ts` (round 2, `29770dd`, `a6875cb`).

## 2. Pass 4's new P0s, fixed
- **redteam-final-1** (citizens' e-mails, IPs and browsers in the Collector's audit log): `9023349`, the audit view keeps only the rows a staff
  role may see, decided by each actor's role when read (rows written before are covered). Test `src/lib/collector/auditview.pass7.test.ts`:
  2/2 fail without the fix, pass with it. Pass 4 had also stopped writing citizens' sign-ins; both are kept.
- **redteam-final-2** (unlimited password guesses at change-password): the desk lane's hunt2-sec-09 fix.
- Pass 4's own final red team (`tests/qa/pass4/redteam-final.test.ts`) passes 17/17 against the gate's build: 12 of its findings are now
  fixed and run as plain tests (`99f896c9` says which pass fixed each); only redteam-final-13 (sign-out) stays `it.fails`, for the owner.

## 3. What the reviewers broke
A fresh reviewer agent tried to break each lane's fixes after every 3 or 4; each break became a row `p7-<lane>-NN` and went back through the
same steps. 69 such rows (reviewers, the merge and the gate): 58 fixed (6 of them P0), 5 P1, 3 P2 and 2 P3 open, 1 P3 for the owner.
- studio-parse: 12 breaks (huge files, pages, memory past the heap, an orphaned reader, a busy page read as "no CAPTCHA"), all fixed (-12,
  the Collector's onboarding on the server thread, P0, after the first merge).
- studio-egress: 17 breaks of the brief-injection fix and the upload limit, all fixed; 3 new P1s outside its files are open (section 5).
- askiq-writer-lock: 1 P0 (the writer check) and 1 P2 (the lock's shared tables) fixed; 1 P3 for the owner.
- rules-periods: 3 fixed (-05, -06, and -07: pass 4's period tests on the combined branch), 3 open (news over a named day or month; a
  narrow topic over a calendar span; one P3), 1 for the owner.
- collector-ops: 7 breaks, all fixed.
- desk-and-accounts: 16 breaks over three reviewers, all fixed but 2 (a P3 in the media route, a P2 cross-language repeat miss).

## 4. The merge (every conflict kept both sides, or says why not)
Each merge commit lists its conflicts and resolutions: `25ab4f55` (pass 4), `83d9a8a2` (fixall), `365b581b` (studio-egress), `aca2bb48`
(the parked repeat fix).
- **Sign-out:** pass 4's gate made sign-out raise the account's token version, which also signs out every other tab and device of that
  account. That changes Apshana's per-tab design (`f49b4ec`, final), so it is **not applied**; its tests are `it.fails` with the reason.
  For the owner: the change is one line, `revokeSessions(session.userId)` in `src/app/api/auth/logout/route.ts` (pass 4's `eec8c840`).
- **Profile photos and mobile:** pass 4 and desk-and-accounts redesigned both. Kept the desk's (private store, random names, owner-only route,
  old photos moved; the profile form never changes a saved number); pass 4's tests keep their intent against it, and its red team's photo and
  mobile cases pass on the build; its `/uploads/profile` rewrite in `next.config.js` was dropped (nothing uses that address now).
- **Password guesses (factors.ts, change-password):** both fixed the parallel-burst race; kept the desk's one-check-at-a-time version.
- **Audit log:** kept pass 7's role filter over pass 4's SQL filter (it also hides citizen rows of every kind and covers old rows).
- **Rules lanes:** kept the one period reader, now fed by pass 4's `windowIn`; kept pass 4's zone-number handling, `topN`, the incidents
  wording, its day ranges in Ask District IQ and its status rankings.
- **netsafe.ts:** both added the IPv4-in-IPv6 checks; kept studio-egress's (also blocks `100::/64`).
- **repeat.ts:** kept desk-and-accounts' rule over the parked `d474842` (it passes all 41 of `d474842`'s cases; the reverse failed 34).
- **Pass 6's fixall vs pass 4:** the confirm actions are the union; login keeps both pass 4's failure counting and fixall's
  "deactivated only after the right password"; the officer drawer keeps both.
- **Found on the merge, fixed:** p7-merge-01 (two backspace bytes written for `\b` in a regex: "recent" stopped meaning today),
  p7-merge-02 (`name in SHARED_TABLES` also found Object.prototype names), p7-merge-03 (Tanglish counts), the Tamil for pass 4's new
  confirm title (pass 6's officer-day-11 test). p7-merge-04 (Jarvis did not read "on 15 Oct"; Ask District IQ did) was fixed later by
  rules-periods (`69820f2`).
- **Pass 6's fix-all rounds 2 and 3, merged after the lanes:** `claude/fixall2-a84a72` at `64e6e155` (merge `65f36ea1`: its remaining
  P1-P3 rows) and `claude/fixall3-a84a72` at `d85e11a9` (merge `8ea224dd`: pass 4's whole-suite failures and SKG1-30). Neither had a
  conflict; the ledger was merged row by row. What each changes on purpose: `docs/qa/fixall/EXPECTED_CHANGES.md`.

## 5. What is left
The ledger (`docs/qa/pass6/BUGS.json`, 317 rows after the pass 6 session's three fix-all rounds): 281 fixed, 23 for the owner, 8 not
reproduced, 4 duplicates, 1 open.
- **Open: fixall3-map-today (P3).** Ask the Map reads "today" as the last 24 hours, while Jarvis and Ask District IQ read it as the calendar
  day since midnight. The map reads every period word as a rolling window, so the fix is to move it onto the shared reader
  (`src/lib/period/read.ts`); it was left until after the gate.
- **Closed by this gate: P5-034.** Pass 4's whole real-path suite on the merged tree, which no gate had run whole and green before (section 6).
- **For the owner (23 rows, unchanged by this pass):** sign-out does not end the session on the server (hunt2-sec-01, redsec2-04,
  skeptic-redsec1-1: the per-tab sign-out was kept, see section 4); the desk password (P5-006, hunt2-sec-08); the closing SMS after a reopen
  (P5-020); joining another department's case (P5-021, hunt2-desk-01, reviewer3-09); which "open" the officer console shows
  (fixall3-officer-open); p7-rules-periods-04; and the rest of the `owner` rows in the ledger.
- **Not run:** no live model was called (no key in the test processes; the code lanes answer); six of pass 4's files skip on their own
  conditions (four need a server already up, one needs `QS`, one needs the sealed set, which is not opened).

## 6. Final gate on `7e815c53` (`tests/qa/pass7/gate.sh`)
`7e815c53` is the merge of round 3 (`8ea224dd`) plus the gate's port settings. Its logs stay in the worktree's
`docs/qa/pass7/evidence/*.log` (`*.log` is gitignored, as pass 6's were); the access matrix, pass 4's suite report
(`evidence/pass4-suite-gate.json`), the golden manifest and its diff are committed. One run, one heavy job at a time, holding the
machine-wide Studio fixture lock:
- type check and lint: clean, no errors (lint's four `<img>` warnings are as before);
- unit suite, 3 shuffled runs in Asia/Kolkata and 1 in UTC (seeds 7201-7204): 4422 passed, 13 skipped, 0 failed in each (the
  `suite-p7-gate-*` summaries in `docs/qa/pass6/results` are the previous gate's, with the same counts: this run's clean-up put them back);
- the lanes' tests in `tests/qa/pass7`: 769 passed, 7 skipped; collector-ops' real-path tests: 24/24;
- pass 4's guards and real-path checks, one file at a time on the pinned snapshot: lane-c 28/28, g2-cache 9/9, dept-lock 10/10, join-lock
  14/14, batch-mail 1/1, critical tile 4/4, Studio browser ws/bypass/more 1/1, 2/2, 2/2, metamorphic 128/128, open-baseline 46/46, and the
  src guards (numbergate, pass 5's seam, SMS, pass 4's class guards) 39/39;
- production build: compiled;
- **pass 4's whole real-path suite** (P5-034), every file in one process, one at a time, on the build: 67 files (61 passed, 6 skipped by
  their own conditions), 2668 tests, 2648 passed, **0 failed**, 20 skipped. The gate on `65f36ea1` failed 30 of 2553 here; pass 7's test
  flips (`43c1698a`) and round 3 fixed them, and `grader/grader.test.ts` (113 tests) now loads. Vitest's exit code was 1 for one error of
  its own, a worker call to the runner that timed out ("Timeout calling onTaskUpdate", seen in pass 4 before:
  `docs/qa/pass4/lanes/b/inproc-before.txt`); the JSON report says success and every file reported the same number of tests as in the
  previous gate, so no result was lost;
- golden master `p7-gate` against pass 6's `p6-gate` (serial, frozen clock, the build): 3,273 requests, no 5xx, no problems, the same 4
  gaps; 332 changed, 7 added, 11 removed: the same requests as on `65f36ea1`, with the same differences, except the map position of the
  complaint the recorder files itself (the noise floor). Every change is explained in `evidence/golden-explained.md`. The gate's clean-up
  step put back the committed manifest after the recording, so the golden master was recorded again on the same build right after the gate
  (`gate.sh` now keeps the gate's own golden and suite files);
- access matrix with valid bodies: 1175 of 1176 cells as designed; the one other is the cell pass 6 explained (GET /api/auth/security as the
  Manu desk account, a department_officer, which reads its own sign-in history);
- browser drive: 28 pages, none with a problem; the petition journey in full (upload, read, approve, code, SMS off, the tracker shows the
  status and nothing personal);
- pass 6's Collector journey j1, Jarvis steps: no problem, and the analyst's answer is shown, not covered by "Asked District IQ" (P6-024);
- pass 4's final red team against the build: 17/17.

Earlier gates, for the record: `94b99ed7` was red (a stale reader bundle, a guard tripped by a comment, five order-dependent test files, a
config that ran all of pass 4, ten period regressions from the merge; `evidence/first-gate/`); `ae65fe84` was green without pass 4's whole
suite and the golden master (`evidence/gate-ae65fe84/`); `65f36ea1` was green except pass 4's whole suite (30 failed), which round 3 took.
