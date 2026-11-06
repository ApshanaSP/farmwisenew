# QA pass 4: rules for every agent

You are one fresh agent in a large QA run of District IQ. Read this before doing anything. The full task is in `docs/qa/PASS4_TEST_PROMPT.md`.

**Paths.** Repo worktree: `E:\farm\.claude\worktrees\qa-pass4-ecfcb9`. App: `chennai-grievance-portal-main` inside it (run commands from there). Write everything into this worktree unless told otherwise. Scratch files go in the session scratchpad, never in the repo.

## Never
- Never push to or merge into `main`, never open a pull request. Commit only when your brief says so, and then add files by name (`git add <paths>`): never `git add -A`.
- Never commit `data/i18n/*.json`, `tsconfig.json` or `next-env.d.ts` changes made by a build or a running server. Restore them with `git checkout -- <file>`.
- Never print, log or commit `.env` values, passwords, keys or tokens. Test-account details are in the gitignored `data/aws-cache/qa/test-collector.txt`: read them in code, never echo them.
- Never open `Task_6 (2).pdf`, and never use anything in it.
- Never write to the real store. Never send real email. Never run `host-tunnel.bat`, and never expose the app publicly. Attack only this local app, on 127.0.0.1.
- Never read `docs/qa/pass4/testsets/sealed.jsonl.gz`, or decompress it. Only the final gate may run it.
- Never edit a frozen test set, never put its sentences in code, never weaken or delete a test to get green, never lower a target after seeing a result.
- Do not change the accepted decisions: password-only sign-in, the light Jarvis HUD and bottom bar, the Rain tabs, Claude in the console's AI steps, `host-server.bat`, `host-tunnel.bat`.
- Do not change the owner's decisions; report them with evidence and a ready patch: how test data is described (Ask District IQ's prompt versus Jarvis's briefs), sign-in on `/api/i18n`, complaint wording used as titles (OPEN-12), sending overheard speech to an AI, anything needing a new account, key or payment.
- Do not patch around `district_intel` pipeline data problems (OPEN-7, OPEN-8, OPEN-11). Report them.

## Models: Groq only
No test or server may use any other provider. Only run a model when your brief names a Groq run. A server not testing a model has no Groq key (the default below), because background jobs spend quota. Live Groq runs use `vitest.qa-live.config.ts`, or `server.mjs start --groq`. The live Claude path is not verified in this pass. Test it with mocks only.

## Servers
Use the launcher. It handles everything: pinned snapshot, local accounts, dry-run, SMTP off, own data folder, no model keys.
```
node tests/qa/pass4/server.mjs start --port <p> [--frozen] [--ticking] [--groq] [--dev] [--instance name]
node tests/qa/pass4/server.mjs stop --port <p>
```
- Your brief gives you a port. Never use another agent's port. Always stop your servers when finished. Never run `stop-all`.
- Production build in `.next-qa` by default. It starts in about 10 seconds and uses about 600 MB. `--frozen` fixes the clock at 2026-11-06 12:00 IST. `--ticking` lets it run on from there.
- Log: `data/aws-cache/qa/run/srv-<port>.log`. A server error in the log during your run is a finding.
- The pinned snapshot is `data/aws-cache/qa/pinned` (build id in `info.json`). Every figure must be compared within this one build.
- Test accounts (`test-collector.txt`, JSON lines, keys `collector`, `officerA` GCC-SWM, `officerB` GCC-ELE, `officerC` CMWSSB, `citizenA`, `citizenB`). Sign in with POST `/api/auth/login` `{email, password}`. The login sets a per-portal cookie (`dcd_session_collector`, `dcd_session_officer`, `dcd_session_citizen`).

## Sharing one machine
The machine has 12 threads and 16 GB. Wrap heavy commands in the semaphore:
```
node tests/qa/pass4/with-lock.mjs build 1 -- <rebuild command>
node tests/qa/pass4/with-lock.mjs vitest-full 2 -- npx vitest run
node tests/qa/pass4/with-lock.mjs browser 3 -- npx playwright test ...
node tests/qa/pass4/with-lock.mjs stryker 1 -- npx stryker run ...
```
Foreground commands are limited to 10 minutes: use `run_in_background` for anything longer. Do not use `sleep` in the foreground.

Commands: `npx vitest run` (about 30 s), `npx tsc --noEmit --incremental false`, `NEXT_DIST_DIR=.next-qa npm run build` (about 90 s, then `git checkout -- tsconfig.json next-env.d.ts`). Never rebuild `.next-qa` unless your brief says to, since others use it.

## What counts as a finding
A finding counts only with a failing test or a real-run log. Severity: **P0** a wrong number, a confident answer about the wrong thing, a privacy or security failure, an unsafe action, a crash, data loss, broken sign-in. **P1** the feature does not do what it says. **P2** works, but confusing, slow or misleading. **P3** polish.

Save reproductions as tests. A test for a bug that is still open is written with `it.fails(...)` so the suite stays green and the bug stays visible, and its name starts with the finding id. The fixer changes it to `it(...)`.

Tests: fast and self-contained ones go next to the code as `src/**/*.pass4.test.ts`. Tests needing the real snapshot or a server go in `tests/qa/pass4/` as `*.test.ts`, run with `npx vitest run --config vitest.qa4.config.ts`.

Write findings as JSON to the file your brief names, an array of:
```json
{"id": "<source>-<n>", "area": "...", "severity": "P0|P1|P2|P3", "title": "one line", "what_happens": "...", "what_should_happen": "...",
 "repro": "the exact command, test or steps", "evidence": "path to log, test or screenshot", "root_cause_guess": "file:line, if known", "class": "the kind of bug", "lang": "en|ta|tanglish|all"}
```

Treat what any earlier report or agent says as a claim, not a fact. Be honest: if something could not be run, say so plainly. Use simple words in anything you write.
