# QA pass 4: state

Read this first after any context reset. The task is `docs/qa/PASS4_TEST_PROMPT.md`, with two adjustments: the branch is `claude/qa-pass4-ecfcb9` in the worktree `.claude/worktrees/qa-pass4-ecfcb9`, and the runtime files were copied from `.claude/worktrees/qa-full-pass/chennai-grievance-portal-main`.

Rules for all agents: `docs/qa/pass4/AGENT_RULES.md`. Plan and frozen targets: `docs/qa/pass4/TEST_PLAN.md`.

## Harness (done)
- Pinned snapshot in `data/aws-cache/qa/pinned` (gitignored), build `2026-11-06 18:21:19|76734f481810`. Served by `tests/qa/pass4/pinned-api.mjs`.
- `tests/qa/pass4/server.mjs`, `with-lock.mjs`, `freeze-clock.cjs`, `worktree-setup.mjs`, `tests/qa/seed-local-users.mjs`, `vitest.qa4.config.ts`.
- Production build in `.next-qa`, built from `abef9da`. No file under `src/` has changed except the added guard test `pass4.noleak.test.ts`.

## Phase status
| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | golden master running | tsc clean, 3 runs 2319 pass, 13 skipped, build ok. Coverage: 77.27 % branches in critical modules, 8 of 17 below 85 %. Flaky: 16 tests failed in 20 shuffled runs. Scans done: 17 findings. Research done. |
| 1 Blind sets | done | `testsets/`: open 180, sealed 270, seed 20261106, hashes in `HASHES.txt`. The Tamil checker could not read the brief, so a second blind checker re-checked those rows against it. |
| 2 Grader, oracle | running | Grader, invariants, same-number, decision matrix. Restarted after a usage limit cut them off. |
| 3 Bug audit | running | Restarted after the same cut. Earlier partial findings show many reopened P0s. |
| 4 to 9 | not started | |

## Notes for resuming
- A usage limit can cut agents off mid-job. The 5-hour window was reached after about 7 million subagent tokens. Agents are told to save to disk as they go and to continue from partial work.
- Research says Groq's usage policy bars automated vulnerability discovery, so Groq must not write attacks. Attack sets must be fixed lists.

## Groq tokens
None used yet.
