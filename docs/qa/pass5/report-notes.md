## How the run went (prose, written by the lead; no counts here)

**Merge.** Pass 4 (`7279522`) merged into main (`d45cf96`) as `393bd96` in about ten minutes: four textual conflicts, each kept both sides (MERGE.md). The merge commit itself did not type-check; two seams git could not see (P5-001, P5-002) were fixed in the next two commits, and four more seams were found later (P5-008 upload cut-off, P5-010 confirm announced as done, P5-013 and P5-015 pass-4 guards broken by main's new code).

**Clock.** Start 09:23 IST. Between about 10:02 and 12:40 the machine was saturated (pass 4's real-path suite took 2 h 41 min while two test servers, the access matrix and the golden recorder ran), and the lead did not check the clock in that stretch. The timetable slipped: wave 2 was not run, and the gate started at 12:58 instead of 13:13.

**Done.**
- Wave 1: five blind hunters (manu-logic, manu-sec, sms-ocr, click-layer, and the merge-seam reviewer `seam`); the click-layer hunter stalled after its axe run.
- The unit suite in the baseline (3 shuffled runs under Asia/Kolkata and one under UTC), pass 4's real-path suite once, the access matrix extended to all 120 routes with a desk identity, two fresh reviewers on the fixes.
- Every fix has a test that fails without it (revert-checked), its root cause in the commit message, and a sweep in `sweeps/` where the class could recur. For P5-001 and P5-002 (the build-breaking seams) the guard test was written just after the fix and then revert-checked against the merge commit; every other fix had its failing test first.
- Two fresh reviewers read the fixes: they broke P5-007, P5-016 and P5-018 and found gaps in P5-012 and P5-019. Each break went back to step 1 and was fixed and revert-checked before the gate.
- The final gate ran on `4dad870` (the code of `174cd6c`): type check, lint, production build, the unit suite 3 times shuffled under Asia/Kolkata and once under UTC, the access matrix and the browser drive with the petition journey. Of the matrix's 2 failing cells, one is an open P3 (a non-multipart upload to the desk answers 500, not 400: P5-033) and one is the desk account reading its own sign-in records (`/api/auth/security`), which is its own account page and allowed by design: the matrix's rule for the desk is stricter than the design there.
- The pass-4 real-path suite's 9694 seconds is the wall time of that one run on a saturated machine.

**Not done or not verified (read these before trusting a "works").**
- **Wave 2 was not run:** pass 4's open list (RC-43, RC-44, RC-35, RC-15, RC-36, RC-46, RC-38, RC-37, PB-316, the citizen date bug on two pages, the 7 open-set rows), `hunt-redsec2`, the second blind hunt, and the journeys (Collector's morning in English and Tamil, an officer's day). The petition journey ran only as the scripted gate drive.
- **Golden master: not recorded.** The recorder made no progress in 2 h 30 min on the loaded machine and was stopped. So golden-master changes are not explained: the target is unmet.
- **Pass 4's real-path suite** ran once (baseline, before most fixes): 10 failing tests were not traced to pass 4's tip or to main (P5-034). It was not re-run in the gate.
- **PaddleOCR live path:** not installed or run. Its server code and the app's behaviour with it down, slow or returning junk were checked by reading and by mocked probes only.
- **Live models:** no Groq or Claude call was made in this run. Nothing model-facing was changed.
- **SMS:** proven off under the QA settings by `src/lib/manu/sms.pass5.test.ts` (fetch and the mailer are stubs that record calls; none is made). No real SMS or email was sent: every server ran with `AWS_STORE_DRY_RUN=1`, `SMS_MODE=off`, blank MSG91 keys and SMTP on port 1.
- **Browser:** the click-layer hunter drove the pages at 360 and 1280 wide in Chromium and ran axe (`evidence/click-layer/axe.json`); the gate drive is in `results/drive-gate.json`. Edge, Firefox and fake-microphone runs were not done.
- **Time zones:** the unit suite ran under Asia/Kolkata and UTC; no frozen-future-clock run, so other date time-bombs like P5-003 may remain.

**Owner decisions (ready patches or evidence, not changed):**
- P5-006 (P0): the petition desk password is published in this public repo and reset on every sign-in attempt. Ready patch: `patches/P5-006-desk-password.patch`. After it, change the password once and remove it from `docs/manu-desk/README.md` and the test.
- P5-020: a closing SMS cannot be corrected after a Collector reopen and reject (one DLT template per kind).
- P5-021: approval can join another department's open case (the existing test asserts it).

**Incident during this run.** At 09:37, listing `.env` key names printed two `.env` lines that are bare Groq key strings (no `NAME=` in front). They appeared only in this session's terminal output: not in any file, log or commit. Rotate those two Groq keys and delete the two bare lines from `.env`.

**Other worktrees.** Nothing was written to `qa-pass4-ecfcb9`, the `p4-lane-*` worktrees, `qa-full-pass` or `E:\farm`. Pass 4's pinned API (port 3199) and a pass 4 Next server were found running from the pass 4 worktree and left alone; this run used its own pinned API on 3198.
