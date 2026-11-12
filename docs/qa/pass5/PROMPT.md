# District IQ: QA Pass 5, a five-hour hunt-and-fix run

## 1. Your job

For **five hours of wall-clock time**, find the most serious bugs in District IQ and fix them at the root. Prove each fix with a test that fails without it. Keep going until the five hours are used. When one wave runs dry, start a fresh one. Do not stop early, and do not stop to ask. The only things held back for the owner are in section 4.

You are not here to confirm earlier work or to raise a score. A bug you can reproduce is worth more than a claim you cannot. Every statement in your report must point to a file, a command or a test that someone else can run again.

The product is District IQ, the entry for FarmwiseAI Campus Product Challenge Task 6. It is a Collector's platform for Chennai with citizen, officer and Collector portals, the new Manu Desk for petitions, the Jarvis voice assistant, Ask District IQ, a live map, briefings, trends and Data Studio.

**Clock:** as your first action, run `date` and write the start time into `docs/qa/pass5/STATE.md`. Check the time with `date` at the start of every phase, and follow the timetable in section 6. Never guess the elapsed time.

**Agents:** use subagents for independent hunting, reviewing and skeptic work. Run at most 6 at a time. Pass 4 hit the usage limit after about 7 million subagent tokens, so give each agent a narrow brief and ask for a short report. Each hunter, reviewer and skeptic starts fresh and does not see the others' conclusions. Treat what any agent reports as a claim until you have reproduced it yourself.

## 2. What is new since the last pass, and why it matters most

Pass 4 (`docs/qa/PASS4_TEST_PROMPT.md`) ran on the branch `claude/qa-pass4-ecfcb9`. At commit `7279522` it is **102 commits ahead of `main` and not merged**. The owner said "Keep, I'll review". Its final gate never ran. Its last state is in `docs/qa/pass4/STATE.md` on that branch.

Since then `main` gained three commits that **no QA pass has tested**: `1f27a63`, `a1e948f` and `d45cf96`. They hold the highest density of untested code in the repo:

| Area | Files | Why it is risky |
|---|---|---|
| Manu Desk petitions | `src/lib/manu/*` (`petitions.ts`, `cases.ts`, `repeat.ts`, `clean.ts`, `read.ts`, `files.ts`, `guard.ts`, `login.ts`, `track.ts`, `constants.ts`), `src/components/manu/*`, `src/app/api/manu/**` | New data entry, new access guard, new login path, new file storage |
| Petition SMS | `src/lib/manu/sms.ts`, `migrations/016_petition_sms.sql` | Can send to real phone numbers; personal data |
| Public tracking | `src/app/track/page.tsx`, `src/app/api/track/route.ts` | Reachable without sign-in: enumeration, data leaks, rate limits |
| Petition photos | `src/app/api/manu/photos/[name]/route.ts` | A file name taken from the URL: path traversal |
| PaddleOCR | `manu_paddle_ocr/server.py`, `src/lib/manu/paddle.ts`, `scripts/start-paddle.cjs`, `setup.bat`, `start.bat`; the old `api/collector/sources/ocr/route.ts` was removed | A new Python server: what it binds to, upload limits, fallback when it is down |
| Site-wide click feedback | `src/lib/activity/install.ts`, `messages.ts`, `src/components/activity/*` | Runs on every page: swallowed clicks, double submits, focus, screen readers, console errors |
| Sign-in and the store | `api/auth/login`, `api/auth/logout`, `src/lib/aws/store.ts` (+83 lines), `migrations/015_petitions.sql` | Session handling and the data layer every page uses |
| Small edits across the app | `api/complaints/route.ts`, `officer/page.tsx`, `ConsoleLoader.tsx`, `Sources.tsx`, `AssistantDialog.tsx`, `JarvisQuestions.tsx`, `lib/collector/{sources,nlp,derive,threads}.ts`, `lib/officer/{data,insights}.ts`, `scheduler.ts`, `next.config.js` | Each can break a pass-4 fix where the two branches meet |
| Regenerated data | `data/datasets/grievances.csv`, `grievance_status_history.csv`, `_truth/duplicate_truth.csv`, the embeddings | Figures and tests pinned to the old data may now be wrong, or wrongly green |

Treat the new code and the place where the two branches meet as the first targets. Pass 4's open list (section 6, wave 2) comes next.

## 3. Where things are

- App: `chennai-grievance-portal-main` (Next.js 14). Pages include `/citizen`, `/citizen/file-complaint`, `/citizen/track-complaints`, `/track`, `/officer`, `/collector`, `/login`, `/register`, `/forgot-password`, `/profile`, `/dev/*`, and the Manu Desk. API routes are under `src/app/api`. Count them yourself; the number has grown since pass 4.
- Jarvis: `src/lib/thunai/` and `src/components/collector/app/thunai/`. `planRound` in `round.ts` runs privacy and safety, then `frame.ts`, then the body resolver `briefTurn` in `entities.ts`, then general knowledge, then `quick.ts`, then the plan cache, then the model.
- Ask District IQ: `src/lib/assistant/`. Officer: `src/lib/officer/`. Console: `src/lib/collector/`. Map: `src/lib/map/`. Data Studio: `src/lib/studio/`. Store: `src/lib/aws/store.ts`.
- **Critical modules** (highest bar): in `src/lib/thunai/`, `privacy`, `injection`, `numbergate`, `entities`, `outside`, `narrate`, `quick`, `frame` and `speechcheck`; `src/lib/collector/effective.ts` and its guard; `src/lib/officer/guard`; `src/lib/manu/guard.ts`; `src/lib/security/stepup`; `src/lib/assistant/compile.ts`; `src/lib/csv`; `src/lib/rate-limit`; and the safe-fetch code (`netsafe`).
- Pass 4 tooling you should reuse rather than rebuild, on the `claude/qa-pass4-ecfcb9` branch: `tests/qa/pass4/` (`server.mjs`, `with-lock.mjs`, `freeze-clock.cjs`, `pinned-api.mjs`, `worktree-setup.mjs`, the golden master, access matrix, fuzz, property and metamorphic suites, the grader), `tests/qa/seed-local-users.mjs`, `vitest.qa4.config.ts`, `docs/qa/pass4/` (`BUGS.json`, `ROOT_CAUSES.md`, `AGENT_RULES.md`, `TEST_PLAN.md`, `TOOLS.md`, `sweeps/`, `results/`).
- Earlier evidence: `docs/qa/` (`BUGS.md`, `FINAL_REPORT.md`, `FEATURE_MATRIX.md`, `DATA_SOURCES.md`, `RESEARCH.md`, `hunt/`). Requirements: `docs/audits/REQUIREMENTS_MATRIX.md` (R1 to R16). Manu Desk notes: `docs/manu-desk/README.md`. Treat all of it as leads, not facts.
- Commands: `npx vitest run`, `npx tsc --noEmit --incremental false`, `npm run build`, `npx next lint`. `@playwright/test` is a dev dependency.
- This prompt is saved at `E:\farm\docs\qa\PASS5_BUG_HUNT_PROMPT.md`, which is outside your worktree and not in git. Copy it to `docs/qa/pass5/PROMPT.md` in your worktree first, so it survives a context reset.

## 4. Rules you never break

- **Git:** work only in this session's own worktree and branch. Never push, never merge into `main`, never open a pull request, and never move another branch. Commit each fix on its own with its bug ids. At the end the owner decides what to push.
- **Other worktrees are read-only:** `.claude/worktrees/qa-pass4-ecfcb9`, `p4-lane-*`, `qa-full-pass` and the main checkout `E:\farm`. You may read from them and copy runtime files out of them. You must never write to them. If a hook refuses a write, **stop that action**. Never get round a refusal with `node`, `sed`, redirects or any other shell trick. Pass 4 did this, and it had to be reported to the owner.
- **Real systems:** `AWS_STORE_SAVE` stays unset and `AWS_STORE_DRY_RUN=1`, always. Make no writes to the real store. Send no real emails and **no real SMS**: find how `sms.ts` sends before any petition test, and make sure every server and test points it at a sandbox or a dead port. Do not run `host-tunnel.bat` or expose the app publicly. Attack only this local app and the local PaddleOCR server.
- **Secrets:** never print, log or commit `.env` values, passwords or keys. `C:\Users\arjun\OneDrive\Desktop\FAI HELPER\Task_6 (2).pdf` holds live third-party credentials: do not open it, and never use them. Test accounts go in the gitignored `data/aws-cache/qa/test-collector.txt` and nowhere else.
- **No gaming:** never edit a frozen test set, never put its sentences in the code, and never weaken, skip or delete a test to get green. Explain any change to an existing test in its commit. Never lower a target after seeing a result.
- **Pass 4's sealed set is not yours.** Do not open, decompress, read or run `docs/qa/pass4/testsets/sealed.jsonl.gz` or `authoring-trail.json.gz`. They belong to pass 4's final gate. You may use `open.jsonl` as a regression set, and must say that it is not blind.
- **Accepted decisions:** Apshana's version is final. Test these but do not change them: password-only sign-in, the light Jarvis HUD and bottom bar, the Rain tabs, Claude in the console's AI steps, `host-server.bat`, `host-tunnel.bat`. The Manu Desk's design and workflow are also the owner's. Fix its bugs, but do not redesign it.
- **Owner's decisions:** do not change these. Report each with evidence and a ready patch the owner can accept:
  - How test data is described (Ask District IQ says never to call it synthetic, while Jarvis's briefs say it is generated).
  - Sign-in on `/api/i18n`.
  - Complaint wording used as titles (OPEN-12).
  - Sending overheard speech to an AI (the address-gate veto).
  - Anything that needs a new account, key, payment or SMS provider.
- **Pipeline data:** `district_intel`, `cfm_dss_collector` and their data files are not app code. Report their problems, and do not patch round them in the app.
- **Models: Groq only for live runs.** This was the owner's choice for pass 4 and still holds. Remove every other provider's key from the process for tests and servers, as `vitest.qa-live.config.ts` does, and set `AI_PROVIDER=groq`, `AI_FALLBACK_PROVIDER=groq` and `AI_CHAT_PROVIDER=groq`, with `AI_FORCE_PROVIDER` empty. Check the quota first with `QA_LIVE=quota`. Spend live calls only on confirming a fix to model-facing behaviour, never on hunting, and keep 250k tokens in reserve. Groq's usage policy bars automated vulnerability discovery, so attack sets must be fixed lists that you write, never generated by Groq. Test the Claude-first path with mocks only, and list it as not verified live. Blank the Groq key on any server that is not testing a model, because background jobs spend quota.
- **Files that never go in a commit:** `data/i18n/*.json` and `data/embeddings/*` written by a running server, `tsconfig.json` edited by a build with a custom `NEXT_DIST_DIR`, `.env`, anything in `data/aws-cache/`, and temporary probe tests such as `zz-*.test.ts`.

## 5. Setup, and the traps already found

1. **Build the base branch.** Your worktree starts from `main` (`d45cf96` or later). Merge pass 4 into it: `git merge --no-ff 7279522`, which is the tip of `claude/qa-pass4-ecfcb9`. Resolve every conflict by keeping both the pass-4 fix and the new `main` behaviour. Where they cannot both hold, keep `main`'s behaviour, write the clash down as a bug, and fix it in wave 1. Record each conflicted file and how you resolved it in `docs/qa/pass5/MERGE.md`. If the merge cannot be made safe within 30 minutes, abort it, work from `main` alone, say so in `STATE.md` and the report, and use pass 4's `BUGS.json` only as leads.
2. Run `npm ci` in `chennai-grievance-portal-main`. Copy these gitignored items from `.claude/worktrees/qa-pass4-ecfcb9/chennai-grievance-portal-main`, or from `E:\farm\chennai-grievance-portal-main` if they are missing there: `.env` (never print it), `data/aws-cache/` (including `qa/pinned` and `qa/test-collector.txt`), and `data/thunai/`.
3. Run servers with `DATA_BACKEND=aws`, `AWS_STORE_DRY_RUN=1`, `AWS_STORE_SAVE` empty, `AWS_DURABLE_FILE=data/aws-cache/qa/durable.sqlite`, `AWS_STORE_RELOAD_MINUTES=100000`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1`, `EMAIL_MODE=sandbox`, the SMS sandbox setting you found, and `NEXT_DIST_DIR=.next-qa5` on port **3105**. Other sessions may be using 3000 and pass 4's ports. Add your own entry to the worktree's `.claude/launch.json` so the preview tool can start it, and remove that entry at the end.

Traps:
- **Startup replaces the local store.** The first query after a server starts downloads a fresh read-only copy over the durable file, and test accounts vanish. Run `tests/qa/seed-local-users.mjs` after each store load. Extend it with a Manu Desk user if the desk has its own login (`src/lib/manu/login.ts`). In dry-run these rows never reach AWS.
- **The snapshot and the clock move.** Log the build id (`[aws-store] ... applied to build ...`) and compare figures only within one build. Use pass 4's pinned snapshot and `freeze-clock.cjs` for the golden master. The datasets were regenerated in `1f27a63`, so re-record the golden baseline on the merged tree **before your first fix**, and never diff against pass 4's old recordings.
- **Migrations:** check that `015_petitions.sql` and `016_petition_sms.sql` apply to a fresh database and to an existing local one, and that running them twice is safe.
- **A running server writes files and spends quota.** See the never-commit list in section 4.
- **Harness gaps.** `src/lib/thunai/qa.live.ts` uses fake hands, so it measures wording and not the data. `QA_LIVE=rules` leaves out the resolver; `rules2` includes it. Score through `planRound` with `serverWorld()` and `serverHands()`.
- **The browser pane blocks the microphone and has a fixed size.** Use Playwright for other viewports, Edge and fake audio.
- **PaddleOCR needs Python.** If `manu_paddle_ocr` cannot be installed in the time, test the app's behaviour with the OCR server down, hanging and returning junk, and list the live OCR path as not verified.

## 6. The timetable

Write `docs/qa/pass5/STATE.md` after every phase and every fix: the time, what is done, what is running, and the next step. After a context reset or a usage limit, read it first and carry on from it.

| Elapsed | Phase |
|---|---|
| 0:00 to 0:40 | **0. Baseline.** Merge (section 5), setup, type check, lint, the full test suite 3 times in shuffled order under `TZ=Asia/Kolkata` and once under `TZ=UTC`, and a production build. Record the golden baseline on the merged tree. Count the API routes and list the ones pass 4's access matrix does not cover. Every failure here is a finding. |
| 0:40 to 2:30 | **1. Wave 1: new code and the merge seam.** See below. |
| 2:30 to 3:50 | **2. Wave 2: pass 4's open work, and the second hunt.** See below. |
| 3:50 to 4:35 | **3. Final gate,** on the final commit only. |
| 4:35 to 5:00 | **4. Report** and final audit. |

If a wave runs out of findings early, start the next one early. If you reach 3:50 with fixes half done, commit only the finished ones, and list the rest as open with their failing tests marked as known failures in a separate file, never as skipped tests.

### Wave 1: new code and the merge seam

Start these hunters in parallel. Each is blind to the others and to the bug lists until it reports:

1. **Manu Desk logic:** read `src/lib/manu/*` and its tests. Check petition intake, cleaning, repeat detection, cases, status changes and the link to incidents, in English, Tamil script and Tanglish. Check messy and empty input, very long text, duplicates and Unicode tricks (NFC and NFD Tamil, zero-width characters, Tamil digits). Do the existing tests check behaviour, or only that the code runs?
2. **Manu Desk and tracking security:** build an access matrix for every route under `api/manu/**`, `api/track` and `/track`, against anonymous, citizen, officer A, officer B, a Manu Desk user and the Collector. Check both the status code and the data scope. Try IDOR and enumeration of petition and incident ids, path traversal on `photos/[name]` (`..`, encoded and doubly encoded, Windows `\`, absolute paths, NUL bytes), upload limits and file types, CSRF, spoofed forwarding headers, rate limits on public tracking, and whether a phone number, name or address shows in tracking output or in logs.
3. **SMS and personal data:** prove in a test that no code path can send a real SMS under the QA settings. Check message content (no personal data beyond what is needed, Tamil encoding, length limits), retries, duplicate sends on double submit, and what happens when the provider fails.
4. **PaddleOCR and its fallback:** what `server.py` binds to (it must be localhost only), size and type limits, timeouts, behaviour when it is down, slow, crashed or returning junk, and the removed `api/collector/sources/ocr` route: does anything still call it?
5. **Click feedback layer:** drive every page in a real browser at 360 and 1280 wide. Check that the layer never swallows a click, blocks a double-submit guard, steals focus, traps the keyboard, hides content from screen readers, or throws in the console. Run `@axe-core/playwright` on the Manu Desk, `/track` and every page that changed.
6. **Merge seam:** for every file both branches touched, and every pass-4 class guard, check that the pass-4 fix still holds on the merged tree. Re-run pass 4's access matrix, fuzz, property and metamorphic suites, the decision matrix and the same-number oracle on the merged tree, and diff the results against pass 4's last results. Look closely at `store.ts`, sign-in and sign-out, `complaints/route.ts`, `Sources.tsx`, `AssistantDialog.tsx` and the officer page.

Fix the findings as they are verified, P0 first, using the fix rules in section 7.

### Wave 2: pass 4's open work, and the second hunt

- From pass 4's `STATE.md` "Still to do" list and `BUGS.json`, take every P0 and P1 that is still open on the merged tree. Reproduce each one first, because many may already be fixed. Then fix the reproducible ones, biggest harm first. The list includes: RC-43, RC-44, RC-35, RC-15, RC-36, RC-46, RC-38, RC-37, PB-316, the citizen date bug on two pages, the 7 open-set rows that went from safe to wrong, and the failing qa4-config tests.
- `hunt-redsec2` never ran in pass 4. Run it now as a fresh red team on the merged tree: IDOR, SQL injection, path traversal, SSRF in link fetching, session revocation after sign-out, secrets in `.next` client chunks, and citizen data in logs and `data/thunai/telemetry.ndjson`. Add prompt injection through every text field a model can read, including the new petition text and OCR output, which are new routes into Jarvis and Ask District IQ.
- Then start a **second hunt** with fresh agents on the fixed tree. Give them the areas from wave 1 plus the Collector console (map, KPI, chart, table and evidence staying in sync) and the officer workflow. Do not tell them what wave 1 found. Report how much the two hunts overlap.
- **Journeys** in a real browser on a production build, read and judged as a real user would see them:
  - A petition at the Manu Desk, its case, the SMS (sandboxed), and the citizen tracking it on a phone-sized screen.
  - A Collector's morning in English and then in Tamil.
  - An officer's day, from a new case to closing it.
  - Any server error log or browser console error is a finding.

## 7. Severity, and what "fixed" means

- **P0:** a wrong number, a confident answer about the wrong thing, a privacy or security failure, a real message sent, an unsafe action, a crash, data loss, or broken sign-in.
- **P1:** a feature does not do what it says.
- **P2:** it works, but it is confusing, slow or misleading.
- **P3:** polish.

Fix every P0 and P1 you verify, and every P2 or P3 where the fix is small and safe. One root cause behind ten symptoms gets one fix.

For each fix:
1. Write a failing test first, on the real code path, with real data where data matters. Mocks are allowed only for external services.
2. Write down the root cause, and why the earlier tests missed it.
3. Fix the mechanism, not the sentence that exposed it. Adding one phrase to a list is not a fix.
4. Sweep for the same class of bug across the codebase, and save the search command and its output in `docs/qa/pass5/sweeps/`.
5. Where it is cheap, add a class guard: a test or lint rule that fails if this kind of bug comes back anywhere.
6. Check English, Tamil script and Tanglish for anything that handles text.
7. **Revert check:** undo the fix, confirm the new test fails, then put the fix back.
8. Re-record the golden master and explain every changed output. An unexplained change blocks the fix.
9. Run the type check and the full test suite, then commit with the bug ids.

A fresh reviewer agent, given only the diff and the bug, reads every P0 fix and tries to break it. Do this in batches to save time. A fix it breaks goes back to step 1.

## 8. Targets (frozen now)

| Measure | Target |
|---|---|
| Open P0s at the end in the new code and the merge seam | 0, or each one listed with its failing test and the reason it is open |
| Every verified P0 and P1 | Fixed with a revert-checked test, or listed as open with its test |
| Real SMS or email sent during the run | 0, proven by a test |
| Access matrix | Covers 100 % of routes, including all new ones, and all are as designed |
| Path traversal, IDOR and enumeration on new routes | 0 |
| Type check and lint | Clean on the final commit |
| Full suite | Green in 3 shuffled runs and both time zones on the final commit, and any flaky test listed |
| Production build | Passes on the final commit |
| Golden-master changes | 100 % explained |
| axe on the new and changed pages | 0 critical or serious |
| Pass-4 regressions caused by the merge | 0, or each listed and fixed |

Unmet targets stay in the report as unmet.

## 9. Final gate (3:50 to 4:35), on the final commit only

1. Type check, lint, and the full suite in 3 shuffled runs under `TZ=Asia/Kolkata` and 1 under `TZ=UTC`.
2. A production build. Restore `tsconfig.json` afterwards.
3. A browser drive of every page and role, plus the petition journey, on that build.
4. The access matrix, fuzz suite and golden-master diff on the merged tree.
5. A fresh red-team agent against your fixes only, given just the list of fixed bugs and the diff.

If you change code after the gate, the gate describes the earlier commit. Say so, and re-run steps 1, 2 and 4.

## 10. What you deliver

In `docs/qa/pass5/`:
- `PROMPT.md` (this prompt), `STATE.md` and `MERGE.md`.
- `BUGS.json`, one row per bug in a form a script can read: id, severity, area, how it was found, repro command, failing test, root cause, fix commit, revert check, status (fixed, open or owner), and whether a reviewer passed it.
- `ROOT_CAUSES.md`: each cluster, why it happened, why earlier tests missed it, and the guard that now stops it.
- `sweeps/`, `evidence/` (logs, screenshots, axe output and golden diffs), and the raw results as JSON.
- `FINAL_REPORT.md`, generated by `tests/qa/pass5/report.mjs` from the raw files, so that no count is typed by hand.
- `OWNER_SUMMARY.md` in short, simple English for someone who does not read code: what works, what does not, the top 10 things to do next with the effort for each, the steps only the owner can do, and what was not verified. Include no secrets.

Before you finish, a fresh agent gets only the repo and the report, and tries to prove the report wrong. It recomputes every count, reverts 10 randomly chosen fixes and confirms their tests fail, repeats 10 "works" claims on the running app, and looks for stale statements about branches and counts. Fix what it finds, and put its verdict word for word in the report.

Leave no temporary files, no probe tests, no stray config changes and no test server running.

End with a short message in simple English:
- The branch and the final commit, and that nothing was pushed.
- How the merge with pass 4 went.
- A table of bugs found, fixed and open, by severity.
- What is still broken.
- What the owner must decide or do, including whether to push this branch.
- What was not verified.
