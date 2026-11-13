# Final gate: the two suites, flaky hunt and coverage (12 Nov 2026)

Code under test: 6bb5423 (src unchanged since; checked with `git diff 6bb5423 HEAD -- src`). Servers on the `.next-qa` build from that commit.

## Default suite (`npx vitest run`, through the vitest-full lock)
3148 passed, 0 failed, 13 skipped (3161 tests, 204 files passed, 2 skipped), 85 s. The 13 skipped are the same 13 in every run of the hunt.

## qa4 suite (`npx vitest run --config vitest.qa4.config.ts`)
Run one file at a time (`--no-file-parallelism`), because several files start their own server and must not share a port. Ports were moved with the env vars the tests already read: 3221 for the files that start their own server (QA_UI_HONESTY_PORT, QA_GOLDEN_TEST_PORT, QA_SAME_NUMBER_PORT, QA_MODEL_PORT, ASKIQ_BASE, RT_PORT), 3222 frozen for access-fuzz, 3223 frozen and ticking for hunt-console and chaos-findings. Last full run: **2618 passed, 1 failed, 13 skipped (2632 tests), 53 files passed, 1 failed, 5 skipped files, 1254 s.** Run before the fixes below: 2566 passed, 2 failed, 63 skipped (decision-matrix skipped all 50).

Not in that run, run by hand after it:
- `hunt-redsec1`, `skeptic-redsec1` have a fixed port the brief does not give, so their two untracked copies `zz-tmp-final-*.test.ts` (made by the red team, port 3223) were run on 3223: hunt-redsec1-1 (`it.fails`) passes, so it is still open; skeptic-redsec1-1 ("expects fix": a cookie copied before logout is rejected after logout) FAILS, so session revocation on logout is still not fixed. The zz copies were left out of the full run (scratch files that another lane owns) and are not committed by this job.
- `hunt-redsec2` (REDSEC2_PORT=3224): 1 passed.
- `skeptic-g2` live parts (SK2_PORT=3224): 15 passed once the server was started with `--env JWT_SECRET=<made-up key>` and the test run with QA_JWT_SECRET set to it (the long-life cookie that visual-lib already supports). Without it, 5 browser tests failed with locator timeouts. That is the harness time bomb below, not a product fault.

### The one failure left: SKG1-30 (skeptic-g1.test.ts)
"export all complaints to excel" is answered as an answer (`Street lights: 3 (rows after cleaning) | Data Studio · Rtf Export`) where the test wants a refusal or a question. It fails every time with the worktree's real `data/studio` (gitignored; it holds a dataset named "Rtf Export" made on 6 Nov) and passes with `STUDIO_DIR` set to an empty folder (37 of 37). So it is a real behaviour, found only when the person has a dataset whose name contains the word "export": a word match on a Data Studio dataset name beats the rule that an order Ask never carries out is refused. P2, wrong thing answered confidently. Repro: the test itself. No test was changed.

### Known harness time bomb
Every test that signs a browser in on a frozen-clock server (token dated 6 Nov, checked against the real clock) is redirected to /login after the evening of 6 Nov. `audit-ui_honesty.test.ts` already mints its own long-life cookie with a key of its own (it passed, 46 of 46, no change needed). `skeptic-g2` and the visual tests need the `--env JWT_SECRET` plus QA_JWT_SECRET pair above.

## Changes in this job (tests only, no src)
- ee36e1a: grepair.pass4.test.ts (order-dependent) and golden.test.ts "reminder for tomorrow 10 am" (zone-dependent), found by hunt 1.
- 178f991: same-number-19 named a hook that no longer exists (vacuous), now `it.fails` with the three real rows; decision-matrix beforeAll warm-up read; finding STORE-1 in `store-first-write-deadlock.md`.
- aa4e8ae: flaky and coverage results, `coverage-compare.mjs`.

## Flaky hunt
Hunt 1 (before fixes): 13 of 20 runs had a failure: grepair 10 times (8 UTC, 2 IST), golden reminder 10 times (all UTC), and three load-only failures in one 178 s run (alerts.test.ts file read error, pass3.test.ts hook, resolver p95 21.5 ms against 20 ms; all passed in the other 39 runs). Hunt 2 (after fixes): **0 failures in 10 UTC runs, 0 in 10 Asia/Kolkata runs**, 3148 passed in each. The `chaos-llm` CHAOS-LLM-1 time limit (4543 ms against 3500) failed once in the qa4 run under load and passed alone and in the next two runs.
