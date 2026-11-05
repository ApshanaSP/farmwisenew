# QA pass: state

Read this first after any context reset.

- Branch `qa/full-pass`, worktree `E:\farm\.claude\worktrees\qa-full-pass`. Cut from `main` at a999d42.
- Copied gitignored runtime data from `E:\farm\chennai-grievance-portal-main`: `.env` (values never printed), `data/aws-cache/` (the cached store snapshot), `data/thunai/` (ledger, memory, telemetry).
- Store: `DATA_BACKEND=aws`, read-only snapshot. Writes stay in a local durable SQLite file: never AWS, since `AWS_STORE_SAVE` is unset and `AWS_STORE_DRY_RUN=1`. SMTP points at `127.0.0.1:1`.
- Live model runs: Groq only, through `vitest.qa-live.config.ts`.

## Phase
- Phases 0–3 done.
- Phase 4: the first hunting pass and the red team are done; their P0s and most P1s are fixed.
- Phase 5: the data audit is written; honesty labels are fixed.
- Phase 8: the final Groq run is done; the reports are drafted.
- Remaining: the browser drive on a production build, seeded faults, a second hunting pass.

## Groq tokens
| Run | Tokens |
|---|---|
| First live40 | 38,276 |
| Police before/after | about 1,200 |
| Final live40 | 24,545 |
| Ledger left at the final start | qwen 175,867; 20b 185,368; 120b 190,937 |

## Next action
Seeded-fault run (`docs/qa/evidence/mutation.txt`), then the browser drive of the login page and console on port 3021 (`.claude/launch.json` `qa-prod-3021`).
