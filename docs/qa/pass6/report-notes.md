## How the run went (prose, written by the lead; no counts here: they are above, from the files)

**Start and clock.** Start 13:54 IST (`STATE.md` has every clock check). Phase 0 ran on a quiet machine in about 30 minutes: setup, type check, lint, the unit suite three times shuffled under Asia/Kolkata and once under UTC, a production build, the golden master and a repeat of it (the noise floor), the access matrix, and the unit suite under a clock moved 30, 90 and 365 days ahead. Only one heavy job ran at a time; the one exception was a single default-config test run that met another run on the Studio fixture port 4599 at 15:39 (63 false failures, all passing alone and on the rerun).

**Golden master: recorded this time.** `p6-base` on the start commit, then `p6-base2` with nothing changed: the two differ only in the map position of the complaint the recorder files itself (the noise floor). The gate's recording `p6-gate` is compared with `p6-base`; each change is explained in `evidence/golden-explained.md`. The golden plan has no ids for the three Manu Desk routes with an id in the path (it reports them as gaps), so the desk's fixes are proven by their own tests and the access matrix, not by the golden diff.

**Access matrix improvement (phase 0).** The matrix now sends a valid body where one is known (`tests/qa/pass6/matrix-bodies.mjs`) and marks every passing deny cell as proven by the guard (401/403) or not. Sending a valid body to the first unproven cell found P6-003 at once: staff accounts could file citizen complaints. The cells it could not make valid are listed under "Access matrix" with their methods.

**Wave A.** Five blind hunters: redsec2 (the red team pass 4 never ran), console-sync, officer-day, journeys, pass4-open (pass 4's open list, re-checked on this tree). redsec2, officer-day and pass4-open reported on time. console-sync and journeys parked in a background wait for the server that never woke them, and reported 18 minutes late without having run anything against the server: console-sync's findings are from reading code, and the journeys hunter's browser scripts were run by the lead later, on the fixed build.

**Fixes and reviewers.** Every fix has a test that fails without it, run before the fix and again with the fix taken out (the revert check), a root cause in its commit message, and pass 4's class guards run after it. A fresh reviewer read every batch of about four fixes as soon as they were committed: five reviewers in all. They broke six fixes (P5-022/023 in part, P5-028's budget, P5-030/037, P6-008, P6-009, P6-011) and found leaks next to two more (P6-006 and P6-012 held for what they claimed). Each break went back to step 1 and is its own row (P6-007, P6-010, P6-011, P6-013, P6-018, P6-019, P6-020, P6-021), fixed and revert-checked. The reviews of the last fixes (reviewers 4 and 5, and the gate's red team) are in their findings files.

**Wave B.** After the fixes, the server was rebuilt from the fixed tree and three fresh blind hunters ran on it (hunt2-sec, hunt2-ops, hunt2-desk); the overlap with wave A is below.

**Changes to existing tests (each explained in its commit).** `src/lib/manu/sms.pass5.test.ts`: a stale 'sending' row is now 'unsure', not resent (P6-010: a duplicate SMS is worse than "not confirmed"). `src/lib/assistant/__tests__/polish.test.ts` (R-11): the list names its numbered titles in quotes (P6-019). `src/lib/studio/studio.test.ts`: the SWD sample test holds its clock (P6-002). `src/lib/manu/files.pass6.test.ts` (pass 6's own): the 20-image ceiling follows the new budget (P6-007).

**Judgement calls the owner should know.**
- P6-019: a number inside a complaint title, a place or a news headline is never a figure for Ask District IQ's written answer unless it is quoted word for word. Honest drafts that name a numbered title without quotes now fall back to the code's own answer (safe, less fluent). Numbers written as words and false claims that reuse a real figure of the card are not caught by a number check.
- P6-010: a send whose outcome is unknown (cut off, timed out after it went out, an unreadable answer) is 'unsure' and never resent; the desk shows it. Pass 5 had chosen to resend a stale row once.
- P6-011/P6-020: the repeat check no longer offers to join another department's case (the route still accepts it: P5-021 is yours).
- The officer console's lists use the Collector's reporting windows (officer-day-01) and the Collector may decide at any stage (officer-day-03): both are listed as yours, not changed.
- Sign-out ends only the tab's cookie (redsec2-04, pass 4's PB-275): Apshana's per-tab sessions (`f49b4ec`) chose this; revoking the one token needs a server-side list of signed-out tokens.
- P5-026: PaddleOCR before the AI reader is the documented order (read.ts, its test). Running the two side by side would give the same result sooner.
- P5-027: per-client rate limits need `TRUST_PROXY_HOPS` set on the server behind the tunnel (host files are Apshana's; not changed).

**Not done or not verified (read before trusting a "works").**
- No live model call was made: every model-facing fix (P6-009, P6-014, P6-019) is proven with written model replies or compiled SQL, not with a model.
- The officer's-day browser journey stalled on a page selector and proves nothing either way; the Collector's morning ran in English only (the Tamil run was not done); the petition journey ran in full.
- pass 4's real-path suite was not run whole (P5-034 is partly traced: see its row); pass 4's tests that start their own servers were not run.
- PaddleOCR live, Edge, Firefox, a fake microphone, and the Tamil Collector journey were not run.
- Findings marked `verified: false` in BUGS.json are the agents' own: their probes or code reading, not re-run by the lead.

**Other worktrees.** Nothing was written to pass 4's or pass 5's worktrees or to `E:\farm`. Pass 4's pinned API (3199) and a pass 4 Next server (3211) were found running from pass 4's worktree and left alone; this run used its own pinned API on 3197 and ports 3106 and 3107.
