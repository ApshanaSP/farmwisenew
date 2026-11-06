# QA pass 4: state

Read this first after any context reset. The task is `docs/qa/PASS4_TEST_PROMPT.md`, with two adjustments: the branch is `claude/qa-pass4-ecfcb9` in the worktree `.claude/worktrees/qa-pass4-ecfcb9`, and the runtime files were copied from `.claude/worktrees/qa-full-pass/chennai-grievance-portal-main`.

Rules for all agents: `docs/qa/pass4/AGENT_RULES.md`. Plan and frozen targets: `docs/qa/pass4/TEST_PLAN.md`.

## Harness (done, commit cd14265)
- Pinned snapshot in `data/aws-cache/qa/pinned` (gitignored), build `2026-11-06 18:21:19|76734f481810`. Served by `tests/qa/pass4/pinned-api.mjs`.
- `tests/qa/pass4/server.mjs`, `with-lock.mjs`, `freeze-clock.cjs`, `worktree-setup.mjs`, `tests/qa/seed-local-users.mjs`, `vitest.qa4.config.ts`.
- Production build in `.next-qa`, built from `abef9da`.

## Phase status
| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | running | Baseline runs done: tsc clean, 3 test runs 2319 pass, 13 skipped, build ok. Golden, coverage, flaky, scans, research running. |
| 1 Blind sets | running | Authors and checkers working in the scratchpad. Then `split-testsets.mjs`. |
| 2 to 9 | not started | |

## Groq tokens
None used yet.
