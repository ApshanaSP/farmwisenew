# QA pass 4: test plan

Written before the first measurement of this pass. Task: `docs/qa/PASS4_TEST_PROMPT.md`.

- Base commit: `abef9da` (the same as GitHub `main`). Branch: `claude/qa-pass4-ecfcb9` in the worktree `.claude/worktrees/qa-pass4-ecfcb9`. This branch stands in for the `qa/pass4` the prompt names. It may be pushed. It never goes to `main`.
- Snapshot: pinned once at `data/aws-cache/qa/pinned` (build `2026-11-06 18:21:19|76734f481810`, gitignored) and served to the real `store.ts` code by a local stand-in for the team API (`tests/qa/pass4/pinned-api.mjs`). The stand-in refuses writes. The clock is frozen at 2026-11-06 12:00 IST for the golden master and figure comparisons (`tests/qa/pass4/freeze-clock.cjs`, through `NODE_OPTIONS`, so production code is unchanged).
- Models: Groq only. The live Claude path is mocked, and is listed as not verified.
- Environment: Node 24.21 on Windows 11, 12 threads, 16 GB. `package.json` asks for Node 22.x, so results here are on a different Node version than the deploy target.

## Targets, frozen before the first run

These are copied from section 8 of the prompt and are not changed after any result is seen.

| Measure | Target |
|---|---|
| Sealed set, confident wrong answers on other bodies, privacy and safety | 0 |
| Sealed set, confident wrong answers overall | 2 % or less |
| Sealed set live on Groq, right | 90 % or more, reported per Groq model and per language, with confidence intervals |
| Noisy-speech family, right or safe | 90 % or more |
| Spoken and shown figures against the oracle | 100 %, with differences reconciled row by row |
| Decision matrix | Every surface moves as designed, or the gap is listed |
| Language parity (metamorphic) | 100 % same facts |
| Privacy leaks, unsafe actions, successful injections | 0 after the fresh red team |
| Mutation score, critical modules | 80 % or more, with every survivor killed or justified |
| Branch coverage, critical modules | 85 % or more; no fall anywhere else |
| Flaky tests | 0 across 10 shuffled runs in both time zones |
| API fuzzing | No 5xx, no stack trace, no partial write, on all 116 routes |
| Access matrix | 100 % as designed |
| Golden-master changes | 100 % explained |
| Known high or critical dependency vulnerabilities in production | 0, or each one listed with its reason |
| Secrets in git history or client bundles | 0 |
| Natural speech, three judges | 4 of 5 or more, with the win rate reported over all pairs |
| Resolver p95 | 20 ms or less |
| Code-lane round p95 | 500 ms or less, at 20 users |
| Soak | 30 minutes, no 5xx, memory settles |
| axe | 0 critical or serious, on every page, both languages |
| Stop rule | Two clean passes in a row |

Unmet targets stay in the report as unmet. No scorecard score goes above 7 unless a separate skeptic reviewed it.

## Critical modules (the highest bar)

`privacy`, `injection`, `numbergate`, `entities`, `outside`, `narrate`, `quick`, `frame`, `speechcheck` in `src/lib/thunai/`; `src/lib/collector/effective.ts` and `guard`; `src/lib/officer/guard`; `src/lib/security/stepup`; `src/lib/assistant/compile.ts`; `src/lib/csv`; `src/lib/rate-limit`; the safe-fetch code (`netsafe`).

## Test method by phase

Phases run in the order given in the prompt, section 6. `STATE.md` records where the run stands.

## Definition of "fixed"

As section 7 of the prompt says: a test failed before the fix and fails again on revert; root cause written; class sweep saved and class guard exists; golden-master diff explained; checked on the real path; reviewer read it and skeptic tried to break it. Each row in `BUGS.md` states which of these parts are met.

## Fast track (owner's order, 6 Nov 2026, 22:35 IST)

The owner asked for the rest of the run to finish within 5 hours, so about 03:35 IST on 7 Nov. Scale is cut to fit, and fewer agents are used. Targets above are not changed. Anything the fast track leaves out appears in the final report as not run, and any target it leaves unmeasured stays unmet.
