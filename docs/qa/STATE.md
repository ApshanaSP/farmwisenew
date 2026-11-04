# QA pass: state

Read this first after any context reset.

- Branch `qa/full-pass`, worktree `E:\farm\.claude\worktrees\qa-full-pass`. Cut from `main` at a999d42.
- Copied gitignored runtime data from `E:\farm\chennai-grievance-portal-main`: `.env` (values never printed), `data/aws-cache/` (121 MB, the cached store snapshot), `data/thunai/` (ledger, memory, telemetry).
- Store: `DATA_BACKEND=aws`. It downloads a read-only snapshot through the team API. Writes go to a local durable SQLite file only, because `AWS_STORE_SAVE` is not set (always dry-run). Tests also set `AWS_STORE_DRY_RUN=1`. SMTP is pointed at `127.0.0.1:1` in every test run.
- Live model runs: Groq only, through `vitest.qa-live.config.ts`. It removes the Anthropic, Gemini, OpenAI, Bedrock and Azure keys from the test process.

## Phase
0 done (baseline, freeze, first runs). 2 next: the police brief, the registry and the resolver.

## Baselines (a999d42, 4 Nov 2026)
- vitest: 143 files, 1963 passed, 13 skipped, 0 failed (`docs/qa/evidence/baseline-vitest.txt`)
- tsc: clean. next build: ok.
- QA held-out, rules only: 54/180 (30.0 %, 23.8-37.1). explain 0/33, unknown 0/26, agency 13/44.

## Groq tokens (shared budget)
- The ledger at the start reported this much left today: qwen 195,932; gpt-oss-20b 195,714; gpt-oss-120b 200,000.
- Spent: first live40 (see `eval/holdout/results/qa-first-live40.json`).
- Reserved: the final live40 (about 80K).

## Bugs in flight
See BUGS.md.

## Next action
Build the registry and the resolver, then make the brief recipe take a department.
