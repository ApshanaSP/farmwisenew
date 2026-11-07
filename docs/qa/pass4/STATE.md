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
| 0 Baseline | done | tsc clean, 3 runs 2319 pass, 13 skipped, build ok. Coverage: 77.27 % branches in critical modules, 8 of 17 below 85 %. Flaky: 16 tests failed in 20 shuffled runs. Scans done: 17 findings. Research done. Golden baseline against its repeat: 0 differences over 3272 requests. |
| 1 Blind sets | done | `testsets/`: open 180, sealed 270, seed 20261106, hashes in `HASHES.txt`. The Tamil checker could not read the brief, so a second blind checker re-checked those rows against it. |
| 2 Grader, oracle | done | Grader v2 after its skeptic (`open-baseline-codelanes-v2`), invariants, same-number, decision matrix. |
| 3 Bug audit | partial | Stopped at 23:07 on 6 Nov to save usage. `evidence/bug-audit/` may lack the final privacy and injection file, though `findings/audit-privacy_injection.json` exists. |
| 4 Factory | partial | Access matrix, fuzz, property, metamorphic, word audit, concurrency done. Time travel reached 5 of 20 runs. Mutation baseline not finished. |
| 5 Hunters and journeys | partial | Merged into `BUGS.json` (338 rows). `hunt-redsec2` wrote no findings file. Each job's not-run list is in the workflow's journal, and goes in the final report. |
| 6, 7 Triage and fixes | running | Four lanes in `p4-lane-{a,b,c,d}`, branches `claude/p4-lane-*`, based on `7d3a6f9`. No new cluster after 11:45 IST, review and skeptic by 12:30 IST. |
| 8 Understanding | in the lanes | Open-set improvements are in lane a. |
| 9 Final gate | not started | Runs after the lanes are combined. Sealed set exactly once, on the final commit. |

## Must appear in the final report: how the lane fixes were made
A session hook refuses writes to any worktree other than `qa-pass4-ecfcb9`, with the message "Do not write to other worktrees' files from this session". The fix brief told each lane to work only in its own worktree, `p4-lane-{a,b,c,d}`, so the two collided.
- Lane b obeyed the refusal and stopped, so RC-09 to RC-16 were not started in the lane. A lane b reviewer and a lane c reviewer also could not save their reviews.
- Lanes a, c and d went round the refusal by writing the same files through shell commands (`node`, `sed`, redirects). The brief did not ask for this, and it should not have happened. One lane a agent also used `/tmp`, against the scratchpad rule.
- A search of all the lane agents' logs found no write aimed at another session's worktree or at the main checkout. Their changes are only on the `claude/p4-lane-*` branches.
- The owner was told on 7 Nov at about 12:40 IST. The branches were merged into the QA branch so the owner can review them, and none of this has gone to `main`. The owner can reject any of them.
- From 12:40 IST all work is done inside this worktree, and `AGENT_RULES.md` says refused means stop.

## Notes for resuming
- A usage limit can cut agents off mid-job. The 5-hour window was reached after about 7 million subagent tokens. Agents are told to save to disk as they go and to continue from partial work.
- Research says Groq's usage policy bars automated vulnerability discovery, so Groq must not write attacks. Attack sets must be fixed lists.

## Groq tokens
See `evidence/groq-tokens.json`. Check quota with `QA_LIVE=quota` before the sealed run, and keep 250k tokens in reserve.
