# FINAL TEST & FIX: progress

Branch `test/final-pass` (from `main` at 4483d25). Prompt: `C:\Users\ELCOT\Desktop\FINAL_TEST_AND_FIX_PROMPT.md`.

## Baseline (27 Oct 2026, commit 4483d25)

| Check | Result |
|---|---|
| vitest | 806 passed, 1 skipped |
| tsc --noEmit | clean |
| golden (AI_PROVIDER=none) | 4 passed, 1 skipped |
| pytest district_intel | 131 passed; scikit-learn 1.8.0 → 1.9.1 version warning (R-23) |
| npm run lint | **not set up**: no ESLint config, `next lint` stops at its setup question (eslint 8.57.1 and eslint-config-next 14.2.15 are installed) |
| npm audit --omit=dev | 3: next (critical, fix only in 16.x), postcss ×2 (high, via next) |

## Done
- Phase 0: branch, harness files, baseline.

## Doing
- R-01 (memory). Measured on the cached build (32 tables): parsing every table at once adds **305 MB** of heap and
  keeps it until the load ends; one table at a time adds **80 MB** and is faster (2.9 s vs 3.9 s).

## Next
- R-01 fix and regression test, then the production test server (`P0-SERVER`), then R-02, R-03.

## Blocked
- none

## Questions for the owner
1. **Test logins:** officer test accounts in at least 3 departments (two in different departments). OK to register a
   `FINALTEST` citizen on localhost?
2. **Test packages:** OK to add the dev-only `@playwright/test` and `@axe-core/playwright` on the test branch? If not,
   `playwright-core` (installed) plus injected `axe-core` is used.
3. **Bedrock key (R-08):** renewed with `npm run ai:key`? How many live AI questions may this run use (max 60 per session)?
4. **R-22:** bind the dev server to 127.0.0.1, or upgrade to Next 16? (The test server binds to 127.0.0.1 anyway.)
5. **R-23:** pin scikit-learn 1.8.0 in the pipeline requirements, or retrain the news model?
6. **Lint:** OK to add `.eslintrc.json` with `next/core-web-vitals` (no new packages; the packages are installed)?

## Records and files created (test data)
- none yet

## Numbers
- Live AI questions used this session: 0
